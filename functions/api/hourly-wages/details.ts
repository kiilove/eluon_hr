type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");
        if (!id) throw new Error("ID required");

        const set = await context.env.DB.prepare("SELECT * FROM hourly_wage_sets WHERE id = ?").bind(id).first();
        if (!set) throw new Error("Set not found");

        // Join to get extra info if needed, or just plain items
        // Left join regular_employees to get codes if they exist?
        const { results: items } = await context.env.DB.prepare(`
            SELECT i.*, e.employee_id as employee_code 
            FROM hourly_wage_values i
            LEFT JOIN regular_employees e ON i.employee_id = e.id
            WHERE i.set_id = ?
            ORDER BY e.name
        `).bind(id).all();

        return new Response(JSON.stringify({ success: true, data: { ...set, items } }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");
        if (!id) throw new Error("ID required");

        // Transaction? D1 doesn't support complex transactions easily in workers without explicit BEGIN/COMMIT logic or batching.
        // We can just batch the deletes.
        await context.env.DB.batch([
            context.env.DB.prepare("DELETE FROM hourly_wage_values WHERE set_id = ?").bind(id),
            context.env.DB.prepare("DELETE FROM hourly_wage_sets WHERE id = ?").bind(id)
        ]);

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};
