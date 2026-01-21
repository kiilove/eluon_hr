
export const onRequestGet = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const defaultMonth = `${y}-${String(m).padStart(2, '0')}`;

        const targetMonth = url.searchParams.get('month') || defaultMonth;
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
            return new Response(JSON.stringify({ success: false, message: "Company ID is required" }), { status: 400 });
        }

        const [ty, tm] = targetMonth.split('-');
        const tYear = parseInt(ty);
        const tMonth = parseInt(tm);

        const sd = new Date(tYear, tMonth - 1, 1);
        const ed = new Date(tYear, tMonth, 1);

        const format = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startStr = format(sd);
        const endStr = format(ed);

        // Fetch Raw Data
        // 1. Work Logs
        const { results: workLogs } = await env.DB.prepare(`
            SELECT work_date, employee_id, actual_work_minutes, overtime_minutes 
            FROM work_logs 
            WHERE work_date >= ? AND work_date < ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(startStr, endStr, companyId).all();

        // 2. Special Logs
        const { results: specialLogs } = await env.DB.prepare(`
            SELECT work_date, employee_id, actual_work_minutes 
            FROM special_work_logs 
            WHERE work_date >= ? AND work_date < ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(startStr, endStr, companyId).all();

        // 3. User Info
        const { results: employees } = await env.DB.prepare(`
            SELECT id, name, position, department FROM regular_employees WHERE company_id = ?
        `).bind(companyId).all();
        const userMap = new Map(employees.map((e: any) => [e.id, e]));

        // JS Aggregation
        const userStats = new Map<number, { regHrs: number, specHrs: number }>();
        const weeklyStats = new Map<string, { regHrs: number, specHrs: number }>();
        // Monthly stats are not needed here as monthly trend is handled by SQL

        // Helper to add (Per-Log Rounding Logic)
        const add = (store: Map<any, any>, key: any, reg: number, spec: number) => {
            const curr = store.get(key) || { regHrs: 0, specHrs: 0 };
            // Round per Log (Integer) to match Calendar Page logic
            curr.regHrs += Math.round(reg / 60);
            curr.specHrs += Math.round(spec / 60);
            store.set(key, curr);
        };

        // Process Work Logs
        for (const log of (workLogs || [])) {
            const actual = log.actual_work_minutes || 0;
            const over = log.overtime_minutes || 0;
            const reg = Math.max(0, actual - over);
            const spec = over;

            add(userStats, log.employee_id, reg, spec);
            // Week key (00-53)
            // Note: strftime('%W') is roughly 1st week of year. 
            // We need a JS equivalent or just trust date.
            // Simple JS week:
            const d = new Date(log.work_date);
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
            const week = Math.ceil((d.getDay() + 1 + numberOfDays) / 7); // Rough week num
            const weekKey = String(week).padStart(2, '0'); // Matches %W format vaguely
            // Better: use the same Logic as API or just week number
            add(weeklyStats, weekKey, reg, spec);
        }

        // Process Special Logs
        for (const log of (specialLogs || [])) {
            const actual = log.actual_work_minutes || 0;
            const reg = 0;
            const spec = actual;

            add(userStats, log.employee_id, reg, spec);

            const d = new Date(log.work_date);
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
            const week = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
            const weekKey = String(week).padStart(2, '0');
            add(weeklyStats, weekKey, reg, spec);
        }

        // --- Summarize ---
        let totalRegularHrs = 0;
        let totalSpecialHrs = 0;
        const topUserList: any[] = [];

        for (const [uid, stat] of userStats.entries()) {
            const u = userMap.get(uid) as any;

            totalRegularHrs += stat.regHrs;
            totalSpecialHrs += stat.specHrs;

            if (u) {
                topUserList.push({
                    user_name: u.name,
                    user_title: u.position,
                    department: u.department,
                    totalOvertime: stat.specHrs * 60 // Convert to min for frontend
                });
            }
        }

        // Sort Top 5
        topUserList.sort((a, b) => b.totalOvertime - a.totalOvertime);
        const top5 = topUserList.slice(0, 5);

        // Transform Weekly Trend
        const weeklyTrend = Array.from(weeklyStats.entries()).map(([week, stat]) => ({
            week,
            totalOvertime: stat.specHrs * 60,
            totalWork: stat.regHrs * 60
        })).sort((a, b) => Number(a.week) - Number(b.week));

        // Monthly Trend (Year Request)
        // Need to fetch full year data?
        // The previous monthly logic fetched data for yearStartStr to yearEndStr.
        // I need to do the same here.
        // For efficiency, I might use SQL for Monthly Trend since it's year-wide and user-rounding matters less for a generic trend bar.
        // Retaining the SQL for Monthly Trend to avoid fetching 365 days of logs to JS.
        const yearStartStr = `${tYear}-01-01`;
        const yearEndStr = `${tYear + 1}-01-01`;
        const yearUnifiedSource = `
            SELECT work_date, (COALESCE(actual_work_minutes, 0) - COALESCE(overtime_minutes, 0)) as reg, COALESCE(overtime_minutes, 0) as spec 
            FROM work_logs
            WHERE work_date >= ? AND work_date < ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
            UNION ALL
            SELECT work_date, 0 as reg, COALESCE(actual_work_minutes, 0) as spec 
            FROM special_work_logs
            WHERE work_date >= ? AND work_date < ?
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `;
        const { results: monthlyTrend } = await env.DB.prepare(`
            SELECT 
                strftime('%Y-%m', work_date) as month,
                SUM(spec) as totalOvertime,
                SUM(reg) as totalWork
            FROM (${yearUnifiedSource})
            GROUP BY month
            ORDER BY month ASC
        `).bind(yearStartStr, yearEndStr, companyId, yearStartStr, yearEndStr, companyId).all();


        return new Response(JSON.stringify({
            success: true,
            summary: {
                totalEmployees: userStats.size,
                totalOvertimeMinutes: totalSpecialHrs * 60, // Passed as minutes (161 * 60)
                totalWorkMinutes: totalRegularHrs * 60,
                avgWorkMinutes: userStats.size > 0 ? ((totalRegularHrs + totalSpecialHrs) / userStats.size) * 60 : 0
            },
            topUsers: top5,
            weeklyTrend: weeklyTrend,
            monthlyTrend: monthlyTrend
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
