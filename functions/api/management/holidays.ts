// Local type definitions
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const companyId = url.searchParams.get("companyId");
        const year = url.searchParams.get("year");

        if (!companyId) return new Response(JSON.stringify({ error: "Company ID is required" }), { status: 400 });

        let sql = "SELECT * FROM holidays WHERE company_id = ?";
        const params: any[] = [companyId];

        if (year) {
            sql += " AND (strftime('%Y', date) = ? OR is_recurring = 1)";
            params.push(year);
        }

        sql += " ORDER BY date ASC";

        const { results } = await context.env.DB.prepare(sql).bind(...params).all();

        return new Response(JSON.stringify({ success: true, data: results }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const { companyId, date, name, type, is_recurring } = payload;

        if (!companyId || !date || !name) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const id = crypto.randomUUID();
        await context.env.DB.prepare(
            "INSERT INTO holidays (id, company_id, date, name, type, is_recurring, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, companyId, date, name, type || 'public', is_recurring ? 1 : 0, Date.now()).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");

        if (!id) return new Response(JSON.stringify({ error: "ID is required" }), { status: 400 });

        await context.env.DB.prepare("DELETE FROM holidays WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
