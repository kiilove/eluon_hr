import { TimeUtils } from '../../../lib/timeUtils';

export const onRequestGet = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const monthStr = url.searchParams.get('month'); // YYYY-MM
        const companyId = url.searchParams.get('company_id');

        if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid month format (YYYY-MM required)' }), { status: 400 });
        }

        const [year, month] = monthStr.split('-').map(Number);

        // 1. Get Total Active Employees
        // TODO: Filter by company_id if provided
        const { results: employees } = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM regular_employees"
        ).run();
        const totalEmployees = employees[0]?.count || 0;

        // 2. Define Weeks for the Month
        // We define a week as inclusion of date. Standard Mon-Sun or simply by dates.
        // Let's use the logic: Week 1 contains the 1st. Week 2 starts next Monday?
        // Or simple 4-5 week breakdown ?
        // Let's stick to "Week Number of Month" logic used in DashboardPage previously.

        const getWeeksInMonth = (y: number, m: number) => {
            const weeks = [];
            const firstDay = new Date(y, m - 1, 1);
            const lastDay = new Date(y, m, 0);

            // Logic: Week 1 is from 1st to first Sunday
            // Week 2 is next Mon-Sun...
            // Last Week ends on lastDay.

            let current = new Date(firstDay);
            let weekNum = 1;

            while (current <= lastDay) {
                // Find end of this week (Sunday or Month End)
                const weekStart = new Date(current);
                const dayOfWeek = current.getDay(); // 0 is Sunday
                const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

                let weekEnd = new Date(current);
                weekEnd.setDate(weekEnd.getDate() + daysToSunday);
                if (weekEnd > lastDay) weekEnd = new Date(lastDay);

                // Check if this week has overlapping data.
                // Just definitions first.
                weeks.push({
                    week: weekNum,
                    start: weekStart.toISOString().split('T')[0],
                    end: weekEnd.toISOString().split('T')[0]
                });

                // Next week starts day after weekEnd
                current = new Date(weekEnd);
                current.setDate(current.getDate() + 1);
                weekNum++;
            }
            return weeks;
        };

        const weeks = getWeeksInMonth(year, month);

        // 3. Query Logs for this Month
        // Improve Performance: Query ALL logs for this month once
        // work_date LIKE 'YYYY-MM%'
        const { results: logs } = await env.DB.prepare(`
            SELECT work_date, employee_id, status, overtime_minutes, actual_work_minutes
            FROM work_logs 
            WHERE work_date LIKE ?
        `).bind(`${monthStr}%`).all();

        // 4. Analyze Status per Week
        const weeklyStatus = weeks.map(w => {
            // Filter logs in this range
            const weekLogs = logs.filter((l: any) => l.work_date >= w.start && l.work_date <= w.end);

            // Count unique employees who have logs
            const employeesWithLogs = new Set(weekLogs.map((l: any) => l.employee_id)).size;

            // Determine Status
            // If > 80% of employees have logs -> COMPLETE
            // If > 0% -> PARTIAL
            // If 0% -> MISSING

            let status = 'MISSING';
            let progress = 0;

            if (totalEmployees > 0) {
                progress = Math.round((employeesWithLogs / totalEmployees) * 100);
            }

            if (progress >= 80) status = 'COMPLETE';
            else if (progress > 0) status = 'PARTIAL';

            return {
                week: w.week,
                range: `${w.start} ~ ${w.end}`,
                employeeCount: employeesWithLogs,
                totalEmployees: totalEmployees,
                progress: progress,
                status: status
            };
        });

        // 5. Monthly Stats
        const totalOvertimeMinutes = logs.reduce((sum: number, l: any) => sum + (l.overtime_minutes || 0), 0);
        const errorLogs = logs.filter((l: any) => l.status === 'ERROR').length;
        const uniqueErrorUsers = new Set(logs.filter((l: any) => l.status === 'ERROR').map((l: any) => l.employee_id)).size;

        // 6. Daily Stats for Calendar (New)
        const dailyStats: Record<string, any> = {};
        logs.forEach((l: any) => {
            const date = l.work_date;
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date: date,
                    hasLogs: true,
                    totalWorkMinutes: 0,
                    totalOvertimeMinutes: 0,
                    errorCount: 0,
                    logCount: 0,
                    status: 'NORMAL' // NORMAL, WARNING, ERROR, MISSING(implicit)
                };
            }
            dailyStats[date].totalWorkMinutes += (l.actual_work_minutes || 0);
            dailyStats[date].totalOvertimeMinutes += (l.overtime_minutes || 0);
            dailyStats[date].logCount++;
            if (l.status === 'ERROR') dailyStats[date].errorCount++;
        });

        // Determine Daily Status
        Object.values(dailyStats).forEach((day: any) => {
            // Simple logic for representative status
            if (day.errorCount > 0) day.status = 'ERROR';
            else if (day.totalOvertimeMinutes > 0) day.status = 'WARNING'; // Or just overtime indicator

            // Check for "Missing" if expected count is known? 
            // For now, if logCount < totalEmployees * 0.8, maybe warning?
            if (totalEmployees > 0 && day.logCount < totalEmployees * 0.5) { // < 50% reported
                day.status = 'INCOMPLETE';
            }
        });

        return new Response(JSON.stringify({
            success: true,
            month: monthStr,
            totalEmployees,
            weeks: weeklyStatus,
            dailyStats: dailyStats, // Added
            stats: {
                totalLogs: logs.length,
                totalOvertimeHours: Math.round(totalOvertimeMinutes / 60),
                violationCount: uniqueErrorUsers
            }
        }), { status: 200 });

    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
    }
};
