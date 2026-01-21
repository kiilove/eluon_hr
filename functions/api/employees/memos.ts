
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body: any = await context.request.json();
        const { employee_id, content } = body;

        if (!employee_id || !content) {
            return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
        }

        await context.env.DB.prepare("INSERT INTO employee_memos (employee_id, content) VALUES (?, ?)").bind(employee_id, content).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id"); // Memo ID

        if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });

        await context.env.DB.prepare("DELETE FROM employee_memos WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
