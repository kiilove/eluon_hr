
interface Env {
    DB: any;
}

export const onRequestGet = async (context: any) => {
    // Standard Headers
    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        const { request, env } = context;
        console.log(`[StatsAPI] Request: ${request.url}`);

        const url = new URL(request.url);
        const month = url.searchParams.get('month'); // YYYY-MM

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return new Response(JSON.stringify({ error: 'Invalid month format (YYYY-MM)' }), { status: 400, headers });
        }

        const startDate = `${month}-01`;
        // Next Month Calculation
        const [y, m] = month.split('-').map(Number);
        let nextY = y;
        let nextM = m + 1;
        if (nextM > 12) { nextY++; nextM = 1; }
        const endDate = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

        console.log(`[StatsAPI] Range: ${startDate} ~ ${endDate}`);

        const queryManual = `
            SELECT work_date, COUNT(*) as count 
            FROM work_logs 
            WHERE work_date >= ? AND work_date < ?
            GROUP BY work_date
        `;

        const querySpecial = `
            SELECT work_date, COUNT(*) as count 
            FROM special_work_logs 
            WHERE work_date >= ? AND work_date < ?
            GROUP BY work_date
        `;

        // 1. Fetch Manual
        let manualRes = { results: [] };
        try {
            manualRes = await env.DB.prepare(queryManual).bind(startDate, endDate).all();
        } catch (e) {
            console.error("[StatsAPI] Manual Query Failed", e);
            // Throwing here is bad if we want to survive, but manual logs are critical.
            throw e;
        }

        // 2. Fetch Special (Fail-safe)
        let specialRes = { results: [] };
        try {
            specialRes = await env.DB.prepare(querySpecial).bind(startDate, endDate).all();
        } catch (e) {
            console.warn("[StatsAPI] Special Query Failed (Table might be missing?)", e);
            // Ignore error, just return empty for special
        }

        const stats: Record<string, number> = {};

        // Aggregate Manual
        if (manualRes.results && Array.isArray(manualRes.results)) {
            manualRes.results.forEach((r: any) => {
                stats[r.work_date] = (stats[r.work_date] || 0) + r.count;
            });
        }

        // Aggregate Special
        if (specialRes.results && Array.isArray(specialRes.results)) {
            specialRes.results.forEach((r: any) => {
                stats[r.work_date] = (stats[r.work_date] || 0) + r.count;
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: stats,
            debug: { startDate, endDate }
        }), { headers });

    } catch (err: any) {
        console.error("[StatsAPI] Error:", err);
        return new Response(JSON.stringify({
            success: false,
            error: err.message || "Internal Server Error"
        }), { status: 500, headers });
    }
};
