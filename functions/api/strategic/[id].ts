// Local type definitions
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

// PUT /api/strategic/[id] - Update Staff
export const onRequestPut: PagesFunction<Env> = async (context) => {
    try {
        const id = context.params.id as string;
        const { name, employee_code, target_persona, daily_work_hours, risk_level } = await context.request.json() as any;

        if (!id) return new Response("ID required", { status: 400 });

        await context.env.DB.prepare(
            `UPDATE project_staff 
             SET name = ?, employee_code = ?, target_persona = ?, daily_work_hours = ?, risk_level = ?
             WHERE id = ?`
        ).bind(name, employee_code, target_persona, daily_work_hours, risk_level, id).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// DELETE /api/strategic/[id] - Remove Staff
export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const id = context.params.id as string;

        if (!id) return new Response("ID required", { status: 400 });

        await context.env.DB.prepare(
            "DELETE FROM project_staff WHERE id = ?"
        ).bind(id).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
