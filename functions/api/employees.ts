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

        const { results: employees } = await context.env.DB.prepare(
            `SELECT e.*, 
            COALESCE(
                (SELECT status FROM employee_status_history WHERE employee_id = e.id ORDER BY effective_date DESC, created_at DESC LIMIT 1),
                'ACTIVE'
            ) as current_status,
            (SELECT effective_date FROM employee_status_history WHERE employee_id = e.id AND status = 'RESIGNED' ORDER BY effective_date DESC LIMIT 1) as resignation_date
            FROM regular_employees e 
            WHERE company_id = ? 
            ORDER BY e.created_at DESC`
        ).bind(companyId).all();

        // Fetch all discretionary history records for this company's employees
        const { results: discretionaryRecords } = await context.env.DB.prepare(
            `SELECT h.* FROM employee_discretionary_history h
             JOIN regular_employees e ON h.employee_id = e.id
             WHERE e.company_id = ?`
        ).bind(companyId).all();

        // Group history records by employee_id
        const discMap = new Map();
        (discretionaryRecords || []).forEach((r: any) => {
            if (!discMap.has(r.employee_id)) {
                discMap.set(r.employee_id, []);
            }
            discMap.get(r.employee_id).push(r);
        });

        const finalResults = (employees || []).map((e: any) => ({
            ...e,
            discretionary_history: discMap.get(e.id) || []
        }));

        return new Response(JSON.stringify(finalResults), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const db = context.env.DB;

        // Unified Creation Payload (Single Object expected from UI, but keeping array support for legacy/bulk if needed, though UI sends single)
        // For the new UI, we expect a single object with specific fields.

        const items = Array.isArray(payload) ? payload : [payload];
        const results = [];
        const stmts = [];

        for (const item of items) {
            // Validation
            if (!item.name || !item.join_date) {
                return new Response(JSON.stringify({ error: "Name and Join Date are required" }), { status: 400 });
            }

            const {
                employee_code, name, department, position, email, phone, source, companyId: explicitCompanyId, is_TF,
                join_date, initial_wage
            } = item;

            // 1. Determine Company
            let companyId = explicitCompanyId;
            if (!companyId && email && email.includes('@')) {
                let domain = email.split('@')[1];
                const company = await db.prepare("SELECT id FROM companies WHERE domain = ?").bind(domain).first();
                if (company) companyId = company.id;
                else if (domain === 'eluonins.com') companyId = 'comp_eluonins';
                else companyId = 'comp_eluon';
            }
            if (!companyId) companyId = 'comp_eluon';

            const empId = crypto.randomUUID();

            // 2. Insert Employee Record
            stmts.push(db.prepare(
                `INSERT OR IGNORE INTO regular_employees (
                    id, company_id, employee_code, name, department, position, email, phone, source, 
                    is_TF, is_pregnant, 
                    pregnancy_reduced_start_time, pregnancy_reduced_end_time, pregnancy_reduced_start_date, pregnancy_reduced_end_date,
                    join_date, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                empId, companyId, employee_code || null, name, department || null, position || null, email || null, phone || null, source || 'manual_unified',
                is_TF ? 1 : 0,
                0, null, null, null, null,
                join_date, Date.now()
            ));

            // 3. Insert Initial 'ACTIVE' Status
            stmts.push(db.prepare(
                `INSERT INTO employee_status_history (id, employee_id, status, effective_date, created_at, reason)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), empId, 'ACTIVE', join_date, Date.now(), 'Initial Registration'));

            // 4. Insert Initial Position/Department History
            if (department || position) {
                stmts.push(db.prepare(
                    `INSERT INTO employee_position_history (id, employee_id, department, position, effective_date, reason, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(crypto.randomUUID(), empId, department || null, position || null, join_date, 'Initial Registration', Date.now()));
            }

            // 5. Insert Initial Hourly Wage (if provided)
            if (initial_wage && Number(initial_wage) > 0) {
                // We need to find or create a wage set for this join_date
                // Since this is inside a transaction loop, we can't easily await read-modify-write safely without blocking.
                // However, D1 doesn't support interactive transactions well in `batch`.
                // BUT, we can try to do a sub-query insert or separate logic.
                // For simplicity and reliability, we'll try to FIND the set first outside the batch or assume we can create it.
                // Actually, if we are batching *everything* in one go, we can't await inside the batch construction.
                // So checking for Set existence needs to happen NOW.

                let setId: string | null = await db.prepare("SELECT id FROM hourly_wage_sets WHERE effective_date = ? AND company_id = ?").bind(join_date, companyId).first('id');

                if (!setId) {
                    setId = crypto.randomUUID();
                    // We must create the set.
                    stmts.push(db.prepare(
                        "INSERT INTO hourly_wage_sets (id, effective_date, company_id, created_at) VALUES (?, ?, ?, ?)"
                    ).bind(setId, join_date, companyId, Date.now()));
                }

                stmts.push(db.prepare(
                    "INSERT INTO hourly_wage_values (set_id, employee_id, amount) VALUES (?, ?, ?)"
                ).bind(setId, empId, Number(initial_wage)));
            }

            results.push({ id: empId, name });
        }

        if (stmts.length > 0) {
            await db.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, count: results.length }), {
            headers: { "Content-Type": "application/json" }
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
        if (payload.is_pregnant !== undefined) { updates.push("is_pregnant = ?"); values.push(payload.is_pregnant ? 1 : 0); }


        // [New] Pregnancy Reduced Hours
        if (payload.pregnancy_reduced_start_time !== undefined) { updates.push("pregnancy_reduced_start_time = ?"); values.push(payload.pregnancy_reduced_start_time); }
        if (payload.pregnancy_reduced_end_time !== undefined) { updates.push("pregnancy_reduced_end_time = ?"); values.push(payload.pregnancy_reduced_end_time); }
        if (payload.pregnancy_reduced_start_date !== undefined) { updates.push("pregnancy_reduced_start_date = ?"); values.push(payload.pregnancy_reduced_start_date); }
        if (payload.pregnancy_reduced_end_date !== undefined) { updates.push("pregnancy_reduced_end_date = ?"); values.push(payload.pregnancy_reduced_end_date); }
        if (payload.join_date !== undefined) { updates.push("join_date = ?"); values.push(payload.join_date); }

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
        let ids: string[] = [];

        if (id) {
            ids.push(id);
        } else {
            try {
                const body = await context.request.json() as any;
                if (Array.isArray(body.ids)) ids = body.ids;
            } catch (e) { }
        }

        if (ids.length === 0) {
            return new Response(JSON.stringify({ error: "No IDs specified" }), { status: 400 });
        }

        const db = context.env.DB;

        // Manual Cascade Delete
        // Even if DB has Cascade, explicit deletion is safer for feedback and ensuring all logic runs.
        const placeholders = ids.map(() => '?').join(',');

        await db.batch([
            db.prepare(`DELETE FROM hourly_wage_values WHERE employee_id IN (${placeholders})`).bind(...ids),
            db.prepare(`DELETE FROM employee_status_history WHERE employee_id IN (${placeholders})`).bind(...ids),
            db.prepare(`DELETE FROM employee_position_history WHERE employee_id IN (${placeholders})`).bind(...ids),
            db.prepare(`DELETE FROM employee_memos WHERE employee_id IN (${placeholders})`).bind(...ids),
            db.prepare(`DELETE FROM employee_discretionary_history WHERE employee_id IN (${placeholders})`).bind(...ids),
            // Finally delete the employee
            db.prepare(`DELETE FROM regular_employees WHERE id IN (${placeholders})`).bind(...ids)
        ]);

        return new Response(JSON.stringify({ success: true, count: ids.length }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
