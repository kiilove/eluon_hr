
interface Env {
    DB: any;
}

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body: any = await request.json();
        const { startDate, endDate } = body;

        if (!startDate || !endDate) {
            return new Response(JSON.stringify({ error: 'Missing startDate or endDate' }), { status: 400 });
        }

        // Validate date format YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return new Response(JSON.stringify({ error: 'Invalid date format' }), { status: 400 });
        }

        const query = `
      DELETE FROM work_logs 
      WHERE work_date >= ? AND work_date <= ?
    `;

        const result = await env.DB.prepare(query).bind(startDate, endDate).run();

        return new Response(JSON.stringify({
            success: true,
            deletedCount: result.meta?.changes || 0
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
