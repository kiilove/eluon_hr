import { generateLeavePlan } from '../../utils/leaveEngine';

// Local type definitions to satisfy linter without installing @cloudflare/workers-types
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const { name, employee_code, target_persona, daily_work_hours, risk_level, companyId, scenario = 'month_end' } = payload;

        if (!companyId || !name || !employee_code) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const id = crypto.randomUUID();

        // 1. Create Staff
        await context.env.DB.prepare(
            `INSERT INTO project_staff (id, company_id, name, employee_code, target_persona, daily_work_hours, risk_level, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            id, companyId, name, employee_code, target_persona, daily_work_hours || "09:00-18:00", risk_level || "low", Date.now()
        ).run();

        // 2. Generate Leave Plan Automatically
        const leaves = generateLeavePlan(id, new Date().getFullYear(), scenario);
        if (leaves.length > 0) {
            const stmt = context.env.DB.prepare(
                `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
            );
            const stmts = leaves.map(l => stmt.bind(l.id, l.staffId, l.leaveDate, l.reason));
            await context.env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, id, leavesCount: leaves.length, ...payload }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
            return new Response(JSON.stringify({ error: "Company ID required" }), { status: 400 });
        }

        const { results } = await context.env.DB.prepare(
            "SELECT * FROM project_staff WHERE company_id = ? ORDER BY created_at DESC"
        ).bind(companyId).all();

        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
