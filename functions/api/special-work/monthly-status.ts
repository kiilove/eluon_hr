
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const year = url.searchParams.get("year"); // Optional now

  if (!companyId) {
    return new Response(JSON.stringify({ success: false, message: "Missing companyId" }), { status: 400 });
  }

  try {
    // 1. Base Query: Join Reports + Employee Records (for recognized time/cost)
    // We group by report (which is essentially monthly, assuming 1 report per month)
    // If multiple reports exist for same month, we should ideally aggregate them or pick latest.
    // The current schema has 'target_month' in reports.
    // We SELECT report_id to allow frontend to open it directly.

    // Note: We use `max(r.id)` to pick one report ID if multiple exist, 
    // but ideally we group by target_month and sum everything.
    // However, for the "Detail View", it expects a single Report ID. 
    // If we have multiple reports for one month, we might need a UI to choose.
    // For now, let's assume 1 report per month or take the latest one.

    let query = `
      SELECT 
        r.target_month as month,
        r.id as report_id,
        COUNT(DISTINCT er.employee_id) as employee_count,
        COUNT(er.id) as record_count,
        SUM(er.calculated_hours) as total_hours, -- Recognized Hours
        SUM(er.total_amount) as total_cost
      FROM special_work_reports r
      LEFT JOIN special_work_employee_records er ON r.id = er.report_id
      -- We must ensure the report belongs to the company. 
      -- Since reports don't have company_id, we check if any employee in it belongs to company.
      -- Or we rely on the fact that the user can only see reports they created (if scoped).
      -- But strictly:
      WHERE EXISTS (
        SELECT 1 FROM special_work_items i 
        JOIN regular_employees e ON i.employee_id = e.id 
        WHERE i.report_id = r.id AND e.company_id = ?
      )
    `;

    const params: any[] = [companyId];

    if (year) {
      query += ` AND r.target_month LIKE ?`;
      params.push(`${year}-%`);
    }

    query += ` GROUP BY r.target_month ORDER BY r.target_month ASC`;

    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // Transform data to match frontend expectation (minutes vs hours)
    // Frontend expects 'total_minutes' for clock icon.
    // We return 'total_minutes' as hours * 60 for compatibility, 
    // OR update frontend to use hours. 
    // Let's return both for safety.
    const data = results.map((row: any) => ({
      ...row,
      total_minutes: (row.total_hours || 0) * 60, // Convert back to minutes for frontend 'Clock' icon logic if needed
      total_recognized_hours: row.total_hours || 0
    }));

    return new Response(JSON.stringify({
      success: true,
      year: year || 'ALL',
      data: data
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message, data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
