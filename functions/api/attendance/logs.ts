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
            // Use provided range
            startDate = queryStartDate;
            endDate = queryEndDate;
        } else if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
            // Fallback to Month logic
            const [year, month] = monthStr.split('-');
            startDate = `${monthStr}-01`;
            const nextMonthDate = new Date(parseInt(year), parseInt(month), 1);
            const nextMonthY = nextMonthDate.getFullYear();
            const nextMonthM = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            endDate = `${nextMonthY}-${nextMonthM}-01`;
        } else {
            return new Response(JSON.stringify({ success: false, message: 'Missing valid Month or Date Range' }), { status: 400 });
        }

        // ... params parsing ...
        console.log(`[LogsAPI] Fetching Logs. Company: ${companyId}, Range: ${startDate} ~ ${endDate}`);

        // 1. Fetch Manual Logs (work_logs)
        const { results: manualResults } = await env.DB.prepare(`
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
            WHERE l.company_id = ? AND l.work_date >= ? AND l.work_date < ?
            ORDER BY l.work_date ASC
        `).bind(companyId, startDate, endDate).all();

        // 2. Fetch Special Logs (special_work_logs)
        const { results: specialResults } = await env.DB.prepare(`
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
            WHERE l.company_id = ? AND l.work_date >= ? AND l.work_date < ?
            ORDER BY l.work_date ASC
        `).bind(companyId, startDate, endDate).all();

        // Helper to transform
        const transformLog = (r: any, type: 'MANUAL' | 'SPECIAL'): ProcessedWorkLog => ({
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
            workType: 'BASIC'
        });

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
