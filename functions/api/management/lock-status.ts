interface Env {
    DB: any;
}

export const onRequestGet = async (context: any) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const month = url.searchParams.get('month'); // YYYY-MM

        if (!month) {
            return new Response(JSON.stringify({ success: false, message: 'Month is required' }), { status: 400 });
        }

        const result = await env.DB.prepare(
            "SELECT is_locked, updated_at FROM monthly_closings WHERE month = ?"
        ).bind(month).first();

        return new Response(JSON.stringify({
            success: true,
            month,
            isLocked: result?.is_locked === 1,
            updatedAt: result?.updated_at
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { month, isLocked } = body;

        if (!month || typeof isLocked !== 'boolean') {
            return new Response(JSON.stringify({ success: false, message: 'Month and isLocked are required' }), { status: 400 });
        }

        await env.DB.prepare(`
            INSERT INTO monthly_closings (month, is_locked, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(month) DO UPDATE SET
                is_locked = excluded.is_locked,
                updated_at = excluded.updated_at
        `).bind(month, isLocked ? 1 : 0, Date.now()).run();

        return new Response(JSON.stringify({
            success: true,
            month,
            isLocked
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
