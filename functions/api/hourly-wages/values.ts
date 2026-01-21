type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
    try {
        const { id, amount } = await context.request.json() as any;
        if (!id || amount === undefined) throw new Error("Invalid payload");

        await context.env.DB.prepare(
            "UPDATE hourly_wage_values SET amount = ? WHERE id = ?"
        ).bind(amount, id).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};
