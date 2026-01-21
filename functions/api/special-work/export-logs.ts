
interface Env {
    DB: any;
}

export const onRequestGet = async (context: any) => {
    try {
        const db = context.env.DB;
        const url = new URL(context.request.url);
        const month = url.searchParams.get('month'); // YYYY-MM
        const companyId = url.searchParams.get('companyId');

        if (!month || !companyId) {
            return new Response(JSON.stringify({ success: false, message: "Month and Company ID are required" }), { status: 400 });
        }

        // 1. Find the Report ID for this month (Scoped by Company)
        // We join with regular_employees or add company_id to reports table?
        // Wait, special_work_reports likely doesn't have company_id directly?
        // Let's check schema. If reports don't have company_id, we must check records.
        // Actually best practice is reports should have company_id. 
        // Based on previous files (reports.ts), `special_work_reports` table might not have it, 
        // but `fetchReports` filters by checking EXISTS in `special_work_items`.

        // BETTER QUERY: Get report where at least one employee belongs to company
        const report = await db.prepare(`
            SELECT r.id, r.title 
            FROM special_work_reports r
            WHERE r.target_month = ? 
            AND EXISTS (
                SELECT 1 FROM special_work_items i 
                JOIN regular_employees e ON i.employee_id = e.id 
                WHERE i.report_id = r.id AND e.company_id = ?
            )
            ORDER BY r.created_at DESC LIMIT 1
        `).bind(month, companyId).first();

        if (!report) {
            return new Response(JSON.stringify({ success: false, message: "No report found for this month" }), { status: 404 });
        }

        // 2. Fetch Data with Join
        // Level 1: Logs (Time)
        // Level 2: Records (Wage)
        // Level 3: Employees (Metadata)
        const query = `
            SELECT 
                l.work_date,
                e.name,
                e.department,
                e.position,
                l.start_time,
                l.end_time,
                l.actual_work_minutes,
                r.special_hourly_wage,
                r.base_hourly_wage
            FROM special_work_logs l
            JOIN special_work_employee_records r ON l.report_id = r.report_id AND l.employee_id = r.employee_id
            JOIN regular_employees e ON l.employee_id = e.id
            WHERE l.report_id = ?
            ORDER BY l.work_date ASC, e.name ASC
        `;

        const { results } = await db.prepare(query).bind(report.id).all();

        return new Response(JSON.stringify({
            success: true,
            report: report,
            data: results
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: (e as Error).message }), { status: 500 });
    }
};
