export const onRequestDelete = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { startDate, endDate } = body;

        console.log(`[LogsAPI] Deleting logs: ${startDate} ~ ${endDate}`);

        if (!startDate || !endDate) {
            return new Response(JSON.stringify({ success: false, message: "Missing startDate or endDate" }), { status: 400 });
        }

        // 1. Delete Manual Logs
        const resManual = await env.DB.prepare(`
            DELETE FROM work_logs WHERE work_date >= ? AND work_date <= ?
        `).bind(startDate, endDate).run();

        // 2. Delete Special Logs (Usually generated, but clean up if requested)
        // Check if table exists implicitly by trying? Or just run it.
        // We know it exists because GET works.
        const resSpecial = await env.DB.prepare(`
            DELETE FROM special_work_logs WHERE work_date >= ? AND work_date <= ?
        `).bind(startDate, endDate).run();

        const deletedCount = (resManual.meta?.changes || 0) + (resSpecial.meta?.changes || 0);

        return new Response(JSON.stringify({
            success: true,
            deletedCount
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error("Delete Logs Error:", e);
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
