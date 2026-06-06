import { ProcessedWorkLog, LogStatus, GlobalConfig } from "../../../types";
import { TimeUtils } from "../../../lib/timeUtils";
import { PolicyUtils } from "../../../lib/policyUtils";
import { calibrateLogDiscretionary } from "../../../lib/correctionUtils";

interface Env {
    DB: any;
}

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json() as any;
        const { startDate, endDate, companyId } = body;

        if (!companyId) {
            return new Response(JSON.stringify({ success: false, message: 'Missing companyId' }), { status: 400 });
        }
        if (!startDate || !endDate) {
            return new Response(JSON.stringify({ success: false, message: 'Missing startDate or endDate' }), { status: 400 });
        }

        console.log(`[CalibrateDiscretionary] Calibrating. Company: ${companyId}, Range: ${startDate} ~ ${endDate}`);

        // 1. Fetch employees for company
        const { results: employees } = await env.DB.prepare(
            "SELECT * FROM regular_employees WHERE company_id = ?"
        ).bind(companyId).all();

        // 2. Fetch discretionary history for company employees
        const { results: discretionaryRecords } = await env.DB.prepare(`
            SELECT h.* FROM employee_discretionary_history h
            JOIN regular_employees e ON h.employee_id = e.id
            WHERE e.company_id = ?
        `).bind(companyId).all();

        const discMap = new Map<string, any[]>();
        (discretionaryRecords || []).forEach((r: any) => {
            if (!discMap.has(r.employee_id)) {
                discMap.set(r.employee_id, []);
            }
            discMap.get(r.employee_id)!.push(r);
        });

        employees.forEach((e: any) => {
            e.discretionary_history = discMap.get(e.id) || [];
        });

        // 3. Fetch policies for company
        const { results: policies } = await env.DB.prepare(
            "SELECT * FROM work_policies WHERE company_id = ? ORDER BY effective_date DESC"
        ).bind(companyId).all();

        // Fallback policy config
        const fallbackConfig: GlobalConfig = {
            standardStartTime: "09:00",
            standardEndTime: "18:00",
            breakTimeMinutes: 60,
            breakTime4hDeduction: 30,
            breakTime8hDeduction: 60,
            clockInGraceMinutes: 10,
            clockInCutoffTime: "08:30",
            clockOutCutoffTime: "18:30",
            maxWeeklyOvertimeMinutes: 720,
            weeklyBasicWorkMinutes: 2400
        };

        // 4. Fetch logs in range
        const { results: rawLogs } = await env.DB.prepare(`
            SELECT 
                l.id,
                l.employee_id,
                u.name as user_name,
                u.position as user_title,
                u.department,
                l.work_date as date,
                l.start_time,
                l.end_time,
                l.log_status,
                l.status,
                l.overtime_minutes,
                l.actual_work_minutes
            FROM work_logs l
            LEFT JOIN regular_employees u ON l.employee_id = u.id
            WHERE l.company_id = ? AND l.work_date >= ? AND l.work_date <= ?
        `).bind(companyId, startDate, endDate).all();

        const transformedLogs = (rawLogs || []).map((r: any) => ({
            id: r.id,
            employeeId: r.employee_id,
            userId: r.user_name || r.employee_id || 'Unknown',
            userName: r.user_name || r.employee_id || 'Unknown',
            userTitle: r.user_title || '',
            department: r.department || '',
            date: r.date,
            startTime: TimeUtils.timeToMinutes(r.start_time),
            endTime: TimeUtils.timeToMinutes(r.end_time),
            rawStartTimeStr: r.start_time,
            rawEndTimeStr: r.end_time,
            actualWorkDuration: r.actual_work_minutes || 0,
            overtimeDuration: r.overtime_minutes || 0,
            status: r.status || 'NORMAL',
            logStatus: r.log_status || 'NORMAL',
            note: '',
            isHoliday: false,
            totalDuration: (TimeUtils.timeToMinutes(r.end_time) - TimeUtils.timeToMinutes(r.start_time)) || 0,
            breakDuration: 60,
            nightWorkDuration: 0,
            restDuration: 0,
            workType: 'BASIC'
        }));

        // 5. Calibrate logs
        const employeeMap = new Map<string, any>();
        employees.forEach((e: any) => employeeMap.set(e.id, e));

        const updates: any[] = [];
        let calibratedCount = 0;
        const details: any[] = [];

        for (const log of transformedLogs) {
            const emp = employeeMap.get(log.employeeId);
            if (!emp) continue;

            const policy = PolicyUtils.getPolicyForDate(log.date, policies as any);
            const activeConfig = policy ? PolicyUtils.toGlobalConfig(policy as any) : fallbackConfig;

            const calibrated = calibrateLogDiscretionary(log as any, emp, activeConfig);
            if (calibrated) {
                calibratedCount++;
                details.push({
                    employeeName: emp.name,
                    date: log.date,
                    originalStartTime: log.rawStartTimeStr,
                    originalEndTime: log.rawEndTimeStr,
                    newStartTime: calibrated.rawStartTimeStr,
                    newEndTime: calibrated.rawEndTimeStr
                });

                updates.push(env.DB.prepare(`
                    UPDATE work_logs 
                    SET 
                        start_time = ?, 
                        end_time = ?, 
                        actual_work_minutes = ?, 
                        overtime_minutes = ?, 
                        status = ?, 
                        log_status = ?
                    WHERE id = ?
                `).bind(
                    calibrated.rawStartTimeStr,
                    calibrated.rawEndTimeStr,
                    calibrated.actualWorkDuration,
                    calibrated.overtimeDuration,
                    calibrated.status,
                    calibrated.logStatus,
                    calibrated.id
                ));
            }
        }

        // 6. Execute updates in batch
        if (updates.length > 0) {
            const BATCH_SIZE = 20;
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                await env.DB.batch(updates.slice(i, i + BATCH_SIZE));
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            calibratedCount,
            details,
            message: `Successfully calibrated ${calibratedCount} logs for discretionary work.`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error('Calibrate discretionary error:', e);
        return new Response(JSON.stringify({ success: false, message: e.message || String(e) }), { status: 500 });
    }
};
