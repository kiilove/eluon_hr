import { ProcessedWorkLog, LogStatus } from "../../../types";
import { TimeUtils } from "../../../lib/timeUtils";

interface Env {
    DB: any;
}

export const onRequestGet = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const monthStr = url.searchParams.get('month'); // YYYY-MM
        const queryStartDate = url.searchParams.get('startDate');
        const queryEndDate = url.searchParams.get('endDate');
        const companyId = url.searchParams.get('companyId');

        let startDate: string;
        let endDate: string;

        if (!companyId) {
            return new Response(JSON.stringify({ success: false, message: 'Missing companyId' }), { status: 400 });
        }

        if (queryStartDate && queryEndDate) {
            // Use provided range (Inclusive)
            startDate = queryStartDate;
            endDate = queryEndDate;
        } else if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
            // Fallback to Month logic
            const [year, month] = monthStr.split('-').map(Number);
            startDate = `${monthStr}-01`;
            const lastDayDate = new Date(year, month, 0); // Last day of target month
            const lastD = String(lastDayDate.getDate()).padStart(2, '0');
            endDate = `${monthStr}-${lastD}`;
        } else {
            return new Response(JSON.stringify({ success: false, message: 'Missing valid Month or Date Range' }), { status: 400 });
        }

        // ... params parsing ...
        console.log(`[LogsAPI] Fetching Logs. Company: ${companyId}, Range: ${startDate} ~ ${endDate}`);

        // 1. Fetch Manual Logs (work_logs)
        const { results: manualResultsRaw } = await env.DB.prepare(`
            SELECT 
                l.id,
                l.employee_id,
                u.name as user_name,
                u.position as user_title,
                u.department,
                l.work_date,
                l.start_time,
                l.end_time,
                l.log_status,
                l.status,
                l.overtime_minutes,
                l.actual_work_minutes
            FROM work_logs l
            LEFT JOIN regular_employees u ON l.employee_id = u.id
            WHERE l.company_id = ? AND l.work_date >= ? AND l.work_date <= ?
            ORDER BY l.work_date ASC
        `).bind(companyId, startDate, endDate).all();

        // 2. Fetch Special Logs (special_work_logs)
        const { results: specialResultsRaw } = await env.DB.prepare(`
            SELECT 
                l.id,
                l.employee_id,
                u.name as user_name,
                u.position as user_title,
                u.department,
                l.work_date,
                l.start_time,
                l.end_time,
                l.break_minutes,
                l.actual_work_minutes,
                l.log_status,
                l.persona
            FROM special_work_logs l
            LEFT JOIN regular_employees u ON l.employee_id = u.id
            WHERE l.company_id = ? AND l.work_date >= ? AND l.work_date <= ?
            ORDER BY l.work_date ASC
        `).bind(companyId, startDate, endDate).all();

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


        // 3. Fetch Resignation Data to Filter Logs
        // Logic: If there is a 'RESIGNED' status history, ignore logs AFTER that date.
        const { results: resignedEmployees } = await env.DB.prepare(`
            SELECT employee_id, effective_date 
            FROM employee_status_history 
            WHERE status = 'RESIGNED' 
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(companyId).all();

        const resignationMap = new Map<string, string>();
        if (resignedEmployees) {
            resignedEmployees.forEach((r: any) => {
                const rDate = r.effective_date.split("T")[0];
                // Keep the latest resignation date if multiple
                const existing = resignationMap.get(r.employee_id);
                if (!existing || rDate > existing) {
                    resignationMap.set(r.employee_id, rDate);
                }
            });
        }

        const filterRetiredLogs = (logs: any[]) => {
            return logs.filter(log => {
                if (log.log_status === 'RESIGNED' || log.log_status === 'PRE_JOIN') {
                    return true;
                }
                const retireDate = resignationMap.get(log.employee_id);
                if (retireDate) {
                    return log.work_date <= retireDate;
                }
                return true;
            });
        };

        const manualResults = filterRetiredLogs(manualResultsRaw || []);
        const specialResults = filterRetiredLogs(specialResultsRaw || []);

        if ((manualResultsRaw?.length || 0) + (specialResultsRaw?.length || 0) > manualResults.length + specialResults.length) {
            console.log(`[LogsAPI] Filtered out ${((manualResultsRaw?.length || 0) + (specialResultsRaw?.length || 0)) - (manualResults.length + specialResults.length)} logs due to resignation.`);
        }

        // Helper to transform
        const transformLog = (r: any, type: 'MANUAL' | 'SPECIAL'): ProcessedWorkLog => {
            const histories = discMap.get(r.employee_id) || [];
            const activeDisc = histories.find((h: any) => {
                const startLimit = (h.start_date && h.start_date !== "null" && h.start_date !== "undefined") ? h.start_date : null;
                const endLimit = (h.end_date && h.end_date !== "null" && h.end_date !== "undefined") ? h.end_date : null;
                return (!startLimit || r.work_date >= startLimit) && (!endLimit || r.work_date <= endLimit);
            });

            const targetStartTime = activeDisc ? (activeDisc.start_time || "09:00") : undefined;
            const targetEndTime = activeDisc ? (activeDisc.end_time || "18:00") : undefined;

            return {
                id: r.id,
                employeeId: r.employee_id,
                userId: r.user_name || r.employee_id || 'Unknown',
                userName: r.user_name || r.employee_id || 'Unknown',
                userTitle: r.user_title || '',
                department: r.department || '',
                date: r.work_date,
                startTime: TimeUtils.timeToMinutes(r.start_time),
                endTime: TimeUtils.timeToMinutes(r.end_time),
                rawStartTimeStr: r.start_time,
                rawEndTimeStr: r.end_time,
                actualWorkDuration: r.actual_work_minutes || 0,
                overtimeDuration: type === 'MANUAL' ? (r.overtime_minutes || 0) : (r.actual_work_minutes || 0),
                status: type === 'MANUAL' ? r.status : 'NORMAL',
                // [Fix] Legacy Data Mapping:
                logStatus: (r.log_status === 'NORMAL' && r.status === 'REST') ? LogStatus.REST : (r.log_status as LogStatus),
                note: r.persona || '',
                isHoliday: false,
                // [Fix] Missing Fields
                totalDuration: (TimeUtils.timeToMinutes(r.end_time) - TimeUtils.timeToMinutes(r.start_time)) || 0,
                breakDuration: r.break_minutes || 0,
                nightWorkDuration: 0,
                restDuration: 0,
                workType: activeDisc ? 'ELASTIC' : 'BASIC',
                isExemptFromOvertime: activeDisc ? true : undefined,
                targetStartTime,
                targetEndTime
            };
        };

        const manualLogs = manualResults.map((r: any) => transformLog(r, 'MANUAL'));
        const specialLogs = specialResults.map((r: any) => transformLog(r, 'SPECIAL'));

        const mode = url.searchParams.get('mode');

        // Stats Mode
        if (mode === 'stats') {
            // ... stats logic (omitted usually but keeping simple)
            const stats: Record<string, number> = {};
            manualLogs.forEach((l: any) => stats[l.date] = (stats[l.date] || 0) + 1);
            specialLogs.forEach((l: any) => stats[l.date] = (stats[l.date] || 0) + 1);
            return new Response(JSON.stringify({ success: true, data: stats }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (mode === 'delete') {
            if (!startDate || !endDate) {
                return new Response(JSON.stringify({ success: false, message: "Missing startDate or endDate" }), { status: 400 });
            }

            console.log(`[LogsAPI] Deleting logs (via GET). Company: ${companyId}, Range: ${startDate} ~ ${endDate}`);

            let deletedCount = 0;
            const startKey = TimeUtils.getWeekKey(startDate);
            const endKey = TimeUtils.getWeekKey(endDate);

            if (startKey === endKey) {
                // Delete Manual (filtered by company via subquery on employee)
                const resManual = await env.DB.prepare(`
                    DELETE FROM work_logs 
                    WHERE week_key = ? 
                    AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
                `).bind(startKey, companyId).run();

                // Delete Special
                const resSpecial = await env.DB.prepare(`
                    DELETE FROM special_work_logs 
                    WHERE week_key = ?
                    AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
                `).bind(startKey, companyId).run();

                deletedCount = (resManual.meta?.changes || 0) + (resSpecial.meta?.changes || 0);
            } else {
                // Range Delete
                const resManual = await env.DB.prepare(`
                    DELETE FROM work_logs 
                    WHERE work_date >= ? AND work_date <= ?
                    AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
                `).bind(startDate, endDate, companyId).run();

                const resSpecial = await env.DB.prepare(`
                    DELETE FROM special_work_logs 
                    WHERE work_date >= ? AND work_date <= ?
                    AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
                `).bind(startDate, endDate, companyId).run();

                deletedCount = (resManual.meta?.changes || 0) + (resSpecial.meta?.changes || 0);
            }

            return new Response(JSON.stringify({ success: true, deletedCount }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
            success: true,
            manualLogs,
            specialLogs
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (err: any) {
        console.error('Fetch Logs Error:', err);
        return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
    }
};

// Separate Delete Handler
export const onRequestDelete = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const companyId = url.searchParams.get('companyId');

        if (!companyId) return new Response(JSON.stringify({ success: false, message: "Missing companyId" }), { status: 400 });
        if (!startDate || !endDate) return new Response(JSON.stringify({ success: false, message: "Missing startDate or endDate" }), { status: 400 });

        console.log(`[LogsAPI] Deleting logs. Company: ${companyId}, Range: ${startDate} ~ ${endDate}`);

        // 1. Delete Manual Logs
        const resManual = await env.DB.prepare(`
            DELETE FROM work_logs 
            WHERE work_date >= ? AND work_date <= ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(startDate, endDate, companyId).run();

        // 2. Delete Special Logs
        const resSpecial = await env.DB.prepare(`
            DELETE FROM special_work_logs 
            WHERE work_date >= ? AND work_date <= ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(startDate, endDate, companyId).run();

        const deletedCount = (resManual.meta?.changes || 0) + (resSpecial.meta?.changes || 0);

        return new Response(JSON.stringify({ success: true, deletedCount }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
