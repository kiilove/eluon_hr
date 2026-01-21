import { generateLeavePlan } from '../../utils/leaveEngine';

// Local type definitions
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

// POST /api/strategic/leaves - Generate or Add Leave
export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const { action, staffId, year = new Date().getFullYear(), date, reason } = payload;

        if (!staffId) return new Response("Staff ID required", { status: 400 });

        if (action === 'generate') {
            const { scenario = 'month_end' } = payload;

            // Use Engine
            const leaves = generateLeavePlan(staffId, year, scenario);

            const stmt = context.env.DB.prepare(
                `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
            );
            const stmts = leaves.map(l => stmt.bind(l.id, l.staffId, l.leaveDate, l.reason));
            if (stmts.length > 0) await context.env.DB.batch(stmts);

            return new Response(JSON.stringify({ success: true, count: leaves.length, leaves }), {
                headers: { "Content-Type": "application/json" },
            });
        }
        else if (action === 'add') {
            // Manual Add
            if (!date) return new Response("Date required", { status: 400 });

            const id = crypto.randomUUID();
            await context.env.DB.prepare(
                `INSERT INTO project_staff_leaves (id, staff_id, leave_date, reason) VALUES (?, ?, ?, ?)`
            ).bind(id, staffId, date, reason || '수동 등록').run();

            return new Response(JSON.stringify({ success: true, id }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response("Invalid action", { status: 400 });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// GET /api/strategic/leaves?staffId=...
export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const staffId = url.searchParams.get('staffId');

        if (!staffId) return new Response("Staff ID required", { status: 400 });

        const { results } = await context.env.DB.prepare(
            "SELECT * FROM project_staff_leaves WHERE staff_id = ? ORDER BY leave_date ASC"
        ).bind(staffId).all();

        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// DELETE /api/strategic/leaves?id=...
export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get('id');

        if (!id) return new Response("ID required", { status: 400 });

        await context.env.DB.prepare(
            "DELETE FROM project_staff_leaves WHERE id = ?"
        ).bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
