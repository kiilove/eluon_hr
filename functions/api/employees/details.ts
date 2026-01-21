
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");

        if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });

        // 1. Basic Info
        const employee = await context.env.DB.prepare("SELECT * FROM regular_employees WHERE id = ?").bind(id).first();
        if (!employee) return new Response(JSON.stringify({ error: "Employee not found" }), { status: 404 });

        // 2. Memos
        const { results: memos } = await context.env.DB.prepare(
            "SELECT * FROM employee_memos WHERE employee_id = ? ORDER BY created_at DESC"
        ).bind(id).all();

        // 3. Wage History
        const { results: wages } = await context.env.DB.prepare(`
            SELECT v.id as value_id, v.amount, s.effective_date
            FROM hourly_wage_values v
            JOIN hourly_wage_sets s ON v.set_id = s.id
            WHERE v.employee_id = ?
            ORDER BY s.effective_date DESC
        `).bind(id).all();

        // 4. Status History
        const { results: statusHistory } = await context.env.DB.prepare(`
            SELECT * FROM employee_status_history
            WHERE employee_id = ?
            ORDER BY effective_date DESC, created_at DESC
        `).bind(id).all();

        // 5. Position History
        const { results: positionHistory } = await context.env.DB.prepare(`
            SELECT * FROM employee_position_history
            WHERE employee_id = ?
            ORDER BY effective_date DESC, created_at DESC
        `).bind(id).all();

        return new Response(JSON.stringify({
            success: true,
            data: {
                employee,
                memos: memos || [],
                wages: wages || [],
                status_history: statusHistory || [],
                position_history: positionHistory || []
            }
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
