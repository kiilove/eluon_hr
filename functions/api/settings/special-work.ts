
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

        const dateFilter = url.searchParams.get("date"); // Optional "YYYY-MM-DD"

        const db = context.env.DB;

        if (dateFilter) {
            // Find LATEST effective policy on or before date
            const set = await db.prepare(`
                SELECT * FROM special_work_policy_sets 
                WHERE company_id = ? AND effective_date <= ?
                ORDER BY effective_date DESC LIMIT 1
            `).bind(companyId, dateFilter).first();

            if (!set) {
                // Return defaults if no policy found
                return new Response(JSON.stringify([
                    { code: 'REGULAR', symbol: '◎', rate: 70000, name: '정규 특근(기본)' },
                    { code: 'REMOTE', symbol: '★', rate: 50000, name: '재택 근무(기본)' }
                ]), { headers: { "Content-Type": "application/json" } });
            }

            const { results: items } = await db.prepare(
                "SELECT * FROM special_work_config_items WHERE policy_id = ?"
            ).bind(set.id).all();

            return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
        } else {
            // Return ALL sets with their items (History View)
            const { results: sets } = await db.prepare(
                "SELECT * FROM special_work_policy_sets WHERE company_id = ? ORDER BY effective_date DESC"
            ).bind(companyId).all();

            const setsWithItems = [];
            for (const s of sets || []) {
                const { results: items } = await db.prepare(
                    "SELECT * FROM special_work_config_items WHERE policy_id = ?"
                ).bind(s.id).all();
                setsWithItems.push({ ...s, items });
            }

            return new Response(JSON.stringify(setsWithItems), { headers: { "Content-Type": "application/json" } });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body: any = await context.request.json();
        const { companyId, effectiveDate, items } = body;
        const targetCompany = companyId || 'comp_eluon';

        if (!effectiveDate || !Array.isArray(items)) {
            return new Response(JSON.stringify({ error: "Missing effectiveDate or items array" }), { status: 400 });
        }

        const db = context.env.DB;

        // Upsert Policy Set
        // Check if exists
        let setId = await db.prepare("SELECT id FROM special_work_policy_sets WHERE company_id = ? AND effective_date = ?")
            .bind(targetCompany, effectiveDate).first('id');

        if (!setId) {
            setId = crypto.randomUUID();
            await db.prepare("INSERT INTO special_work_policy_sets (id, company_id, effective_date) VALUES (?, ?, ?)")
                .bind(setId, targetCompany, effectiveDate).run();
        } else {
            // ID exists, we will reuse it and replace items
        }

        // Replace Items: Delete all for this set, then insert
        await db.prepare("DELETE FROM special_work_config_items WHERE policy_id = ?").bind(setId).run();

        const stmts = [];
        for (const item of items) {
            const itemId = crypto.randomUUID();
            stmts.push(
                db.prepare(`INSERT INTO special_work_config_items (id, policy_id, name, code, symbol, rate) VALUES (?, ?, ?, ?, ?, ?)`)
                    .bind(itemId, setId, item.name, item.code, item.symbol, item.rate)
            );
        }

        if (stmts.length > 0) {
            await db.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, count: stmts.length }), {
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

        if (!id) return new Response("Missing ID", { status: 400 });

        const db = context.env.DB;
        await db.prepare("DELETE FROM special_work_policy_sets WHERE id = ?").bind(id).run();
        // Items cascade delete due to foreign key, but let's be safe if sqlite doesn't enforce it by default without config
        // PRAGMA foreign_keys = ON within D1 is tricky, so explicit delete is safer
        await db.prepare("DELETE FROM special_work_config_items WHERE policy_id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
