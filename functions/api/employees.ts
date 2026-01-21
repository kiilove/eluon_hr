// Local type definitions to satisfy linter without installing @cloudflare/workers-types
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
            `SELECT e.*, 
            (SELECT status FROM employee_status_history WHERE employee_id = e.id ORDER BY effective_date DESC, created_at DESC LIMIT 1) as current_status
            FROM regular_employees e 
            WHERE company_id = ? 
            ORDER BY e.created_at DESC`
        ).bind(companyId).all();
        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;

        // Support both single object and bulk array
        const items = Array.isArray(payload) ? payload : [payload];
        const results = [];
        const stmts = [];

        for (const item of items) {
            const {
                employee_code, name, department, position, email, phone, source, companyId: explicitCompanyId, is_TF
            } = item;

            // 1. Determine Company
            let companyId = explicitCompanyId;

            // Fallback to Domain Logic if not provided
            if (!companyId && email && email.includes('@')) {
                let domain = email.split('@')[1];
                const company = await context.env.DB.prepare("SELECT id FROM companies WHERE domain = ?").bind(domain).first();
                if (company) companyId = company.id;
                else if (domain === 'eluonins.com') companyId = 'comp_eluonins';
                else companyId = 'comp_eluon'; // Default
            }

            if (!companyId) companyId = 'comp_eluon'; // Ultimate fallback

            const id = crypto.randomUUID();

            // Prepare statement (Batching later if possible, but for loop fine for now or constructing a huge batch)
            // D1 batch takes array of prepared statements.
            stmts.push(
                context.env.DB.prepare(
                    `INSERT OR IGNORE INTO regular_employees (id, company_id, employee_code, name, department, position, email, phone, source, is_TF, last_synced_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    id, companyId, employee_code || null, name, department, position, email || null, phone || null, source || 'excel', is_TF ? 1 : 0, Date.now()
                )
            );

            results.push({ id, name, companyId });
        }

        if (stmts.length > 0) {
            await context.env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, count: results.length, results }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const { id, is_TF, name, department, position, email, phone, employee_code, profile_image } = payload;

        if (!id) {
            return new Response("Missing ID", { status: 400 });
        }

        // Dynamic Update Query
        const updates: string[] = [];
        const values: any[] = [];

        if (is_TF !== undefined) { updates.push("is_TF = ?"); values.push(is_TF ? 1 : 0); }
        if (name !== undefined) { updates.push("name = ?"); values.push(name); }
        if (department !== undefined) { updates.push("department = ?"); values.push(department); }
        if (position !== undefined) { updates.push("position = ?"); values.push(position); }
        if (email !== undefined) { updates.push("email = ?"); values.push(email); }
        if (phone !== undefined) { updates.push("phone = ?"); values.push(phone); }
        if (employee_code !== undefined) { updates.push("employee_code = ?"); values.push(employee_code); }
        if (profile_image !== undefined) { updates.push("profile_image = ?"); values.push(profile_image); }

        updates.push("last_synced_at = ?");
        values.push(Date.now());

        if (updates.length > 1) { // At least one field + last_synced_at
            const sql = `UPDATE regular_employees SET ${updates.join(", ")} WHERE id = ?`;
            values.push(id);
            await context.env.DB.prepare(sql).bind(...values).run();
        }

        return new Response(JSON.stringify({ success: true }), {
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

        // Support bulk delete via body if needed, but query param is simple for single
        // For bulk, client usually sends POST with method override or specific endpoint. 
        // Let's support DELETE with body if standard permits, OR query param "ids" (comma separated)

        let ids: string[] = [];

        if (id) {
            ids.push(id);
        } else {
            // Try body for array
            try {
                const body = await context.request.json() as any;
                if (Array.isArray(body.ids)) ids = body.ids;
            } catch (e) {
                // Ignore json parse error if body is empty
            }
        }

        if (ids.length === 0) {
            return new Response(JSON.stringify({ error: "No IDs specified" }), { status: 400 });
        }

        // Batch Delete
        // D1 doesn't support "WHERE id IN (?)" with array binding well.
        // Or construct usage: `IN (${ids.map(()=>'?').join(',')})`
        const placeholders = ids.map(() => '?').join(',');
        const stmt = context.env.DB.prepare(`DELETE FROM regular_employees WHERE id IN (${placeholders})`);
        await stmt.bind(...ids).run();

        return new Response(JSON.stringify({ success: true, count: ids.length }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
