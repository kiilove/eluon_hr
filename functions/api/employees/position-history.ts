type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

// GET: Fetch position history for an employee
export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const employeeId = url.searchParams.get("employeeId");

        if (!employeeId) {
            return new Response(JSON.stringify({ error: "employeeId is required" }), { status: 400 });
        }

        const { results } = await context.env.DB.prepare(
            `SELECT * FROM employee_position_history 
             WHERE employee_id = ? 
             ORDER BY effective_date DESC, created_at DESC`
        ).bind(employeeId).all();

        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// POST: Add new position history entry
export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { employeeId, department, position, effectiveDate, reason } = await context.request.json() as any;

        if (!employeeId || !effectiveDate) {
            return new Response(JSON.stringify({ error: "employeeId and effectiveDate are required" }), { status: 400 });
        }

        const id = crypto.randomUUID();

        await context.env.DB.prepare(
            `INSERT INTO employee_position_history (id, employee_id, department, position, effective_date, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, employeeId, department || null, position || null, effectiveDate, reason || null, Date.now()).run();

        // Update current values in regular_employees if this is the latest entry
        await context.env.DB.prepare(
            `UPDATE regular_employees 
             SET department = ?, position = ?, last_synced_at = ?
             WHERE id = ?`
        ).bind(department || null, position || null, Date.now(), employeeId).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// DELETE: Remove position history entry
export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "id is required" }), { status: 400 });
        }

        await context.env.DB.prepare(
            `DELETE FROM employee_position_history WHERE id = ?`
        ).bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
