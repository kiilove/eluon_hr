type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const companyId = url.searchParams.get("companyId");

        if (!companyId) return new Response(JSON.stringify({ error: "Company ID is required" }), { status: 400 });

        const { results } = await context.env.DB.prepare(
            `SELECT s.*, 
                    (SELECT COUNT(*) FROM hourly_wage_values WHERE set_id = s.id) as item_count 
             FROM hourly_wage_sets s 
             WHERE s.company_id = ?
             ORDER BY s.effective_date DESC`
        ).bind(companyId).all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};
