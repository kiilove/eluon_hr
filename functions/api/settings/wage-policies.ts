
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");
        const companyId = url.searchParams.get("companyId");

        if (!companyId) return new Response(JSON.stringify({ error: "Company ID is required" }), { status: 400 });

        if (id) {
            const policy = await db.prepare("SELECT * FROM wage_multiplier_policies WHERE id = ? AND company_id = ?").bind(id, companyId).first();
            return new Response(JSON.stringify(policy), { headers: { "Content-Type": "application/json" } });
        }

        const { results } = await db.prepare("SELECT * FROM wage_multiplier_policies WHERE company_id = ? ORDER BY effective_date DESC, created_at DESC").bind(companyId).all();
        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body: any = await context.request.json();
        const { id, name, effective_date, base_multiplier, special_work_multiplier, night_work_multiplier, companyId } = body;

        if (!name || !effective_date || !companyId) {
            return new Response(JSON.stringify({ error: "Name, Effective Date, and Company ID are required" }), { status: 400 });
        }

        const db = context.env.DB;
        const targetId = id || crypto.randomUUID();

        // Upsert
        const existing = await db.prepare("SELECT id FROM wage_multiplier_policies WHERE id = ?").bind(targetId).first();

        if (existing) {
            await db.prepare(`
                UPDATE wage_multiplier_policies 
                SET name = ?, effective_date = ?, base_multiplier = ?, special_work_multiplier = ?, night_work_multiplier = ?
                WHERE id = ? AND company_id = ?
            `).bind(name, effective_date, base_multiplier || 1.0, special_work_multiplier || 1.5, night_work_multiplier || 0.5, targetId, companyId).run();
        } else {
            await db.prepare(`
                INSERT INTO wage_multiplier_policies (id, name, effective_date, base_multiplier, special_work_multiplier, night_work_multiplier, company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(targetId, name, effective_date, base_multiplier || 1.0, special_work_multiplier || 1.5, night_work_multiplier || 0.5, companyId).run();
        }

        return new Response(JSON.stringify({ success: true, id: targetId }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");

        if (!id) return new Response("Missing ID", { status: 400 });

        const db = context.env.DB;
        await db.prepare("DELETE FROM wage_multiplier_policies WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
