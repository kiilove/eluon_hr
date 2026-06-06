
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
        // [Modified] Added start_time, end_time for anomaly detection
        const { results: workLogs } = await env.DB.prepare(`
            SELECT work_date, employee_id, actual_work_minutes, overtime_minutes, start_time, end_time
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
        const userStats = new Map<number, { regHrs: number, specHrs: number, dept: string }>();
        const weeklyStats = new Map<string, { regHrs: number, specHrs: number }>();

        // [New] Weekly Hours per Employee (for compliance risk)
        const employeeWeeklyHours = new Map<string, number>(); // key: "empId-week"

        // Anomalies
        const anomalies: string[] = [];
        let anomalyCount = 0;

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

            const u = userMap.get(log.employee_id) as any;
            const dept = u ? u.department || '미지정' : '미지정';

            // User stats with department
            const uStat = userStats.get(log.employee_id) || { regHrs: 0, specHrs: 0, dept };
            uStat.regHrs += Math.round(reg / 60);
            uStat.specHrs += Math.round(spec / 60);
            userStats.set(log.employee_id, uStat);

            // [New] Anomaly Detection
            if (log.start_time && !log.end_time) {
                const name = u ? u.name : 'Unknown';
                if (anomalies.length < 5) anomalies.push(`${name} (${log.work_date})`);
                anomalyCount++;
            }

            // Week Calculation
            const d = new Date(log.work_date);
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
            const week = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
            const weekKey = String(week).padStart(2, '0');
            add(weeklyStats, weekKey, reg, spec);

            // [New] Employee Weekly Total
            const empWeekKey = `${log.employee_id}-${weekKey}`;
            const currentWeekly = employeeWeeklyHours.get(empWeekKey) || 0;
            employeeWeeklyHours.set(empWeekKey, currentWeekly + (actual / 60)); // Sum hours
        }

        // Process Special Logs
        for (const log of (specialLogs || [])) {
            const actual = log.actual_work_minutes || 0;
            const u = userMap.get(log.employee_id) as any;
            const dept = u ? u.department || '미지정' : '미지정';

            const uStat = userStats.get(log.employee_id) || { regHrs: 0, specHrs: 0, dept };
            uStat.specHrs += Math.round(actual / 60);
            userStats.set(log.employee_id, uStat);

            const d = new Date(log.work_date);
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
            const week = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
            const weekKey = String(week).padStart(2, '0');
            add(weeklyStats, weekKey, 0, actual);

            // [New] Employee Weekly Total (Special work counts toward 52h)
            const empWeekKey = `${log.employee_id}-${weekKey}`;
            const currentWeekly = employeeWeeklyHours.get(empWeekKey) || 0;
            employeeWeeklyHours.set(empWeekKey, currentWeekly + (actual / 60));
        }

        // --- Summarize ---
        let totalRegularHrs = 0;
        let totalSpecialHrs = 0;
        const topUserList: any[] = [];
        const deptOvertimeMap = new Map<string, number>();

        // 1. Compliance Risk Assessment
        const riskEmployees = new Set<number>();
        const warningEmployees = new Set<number>();
        for (const [key, hours] of employeeWeeklyHours.entries()) {
            const empId = parseInt(key.split('-')[0]);
            if (hours >= 52) riskEmployees.add(empId);
            else if (hours >= 48) warningEmployees.add(empId);
        }

        for (const [uid, stat] of userStats.entries()) {
            const u = userMap.get(uid) as any;
            totalRegularHrs += stat.regHrs;
            totalSpecialHrs += stat.specHrs;

            // Department Overtime
            const currentDeptOt = deptOvertimeMap.get(stat.dept) || 0;
            deptOvertimeMap.set(stat.dept, currentDeptOt + (stat.specHrs * 60));

            if (u) {
                topUserList.push({
                    user_name: u.name,
                    user_title: u.position,
                    department: u.department,
                    totalOvertime: stat.specHrs * 60
                });
            }
        }

        // Department Breakdown (Sort by OT)
        const totalOtTime = totalSpecialHrs * 60;
        const departmentOvertime = Array.from(deptOvertimeMap.entries()).map(([department, ot]) => ({
            department,
            totalOvertimeMinutes: ot,
            percentage: totalOtTime > 0 ? Math.round((ot / totalOtTime) * 100) : 0
        })).sort((a, b) => b.totalOvertimeMinutes - a.totalOvertimeMinutes).slice(0, 5);

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
        const { results: monthlyTrendResults } = await env.DB.prepare(`
            SELECT 
                strftime('%Y-%m', work_date) as month,
                SUM(spec) as totalOvertime,
                SUM(reg) as totalWork
            FROM (${yearUnifiedSource})
            GROUP BY month
            ORDER BY month ASC
        `).bind(yearStartStr, yearEndStr, companyId, yearStartStr, yearEndStr, companyId).all();

        // [New] Trend Comparison (Current vs Previous Month)
        const prevMonthStr = format(new Date(tYear, tMonth - 2, 1)).slice(0, 7);
        const currentMonthTotalOt = totalSpecialHrs * 60;
        const prevMonthData = (monthlyTrendResults || []).find((r: any) => r.month === prevMonthStr) as any;
        const prevMonthTotalOt = prevMonthData ? prevMonthData.totalOvertime : 0;

        let overtimeChangePercentage = 0;
        if (prevMonthTotalOt > 0) {
            overtimeChangePercentage = Math.round(((currentMonthTotalOt - prevMonthTotalOt) / prevMonthTotalOt) * 100);
        } else if (currentMonthTotalOt > 0) {
            overtimeChangePercentage = 100;
        }

        return new Response(JSON.stringify({
            success: true,
            summary: {
                totalEmployees: userStats.size,
                totalOvertimeMinutes: totalSpecialHrs * 60,
                totalWorkMinutes: totalRegularHrs * 60,
                avgWorkMinutes: userStats.size > 0 ? ((totalRegularHrs + totalSpecialHrs) / userStats.size) * 60 : 0
            },
            complianceRisk: {
                highRiskCount: riskEmployees.size,
                warningCount: warningEmployees.size
            },
            departmentOvertime: departmentOvertime,
            previousMonthComparison: {
                overtimeChangePercentage: overtimeChangePercentage
            },
            topUsers: top5,
            weeklyTrend: weeklyTrend,
            monthlyTrend: monthlyTrendResults,
            anomalies: anomalies,
            anomalyCount: anomalyCount
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
