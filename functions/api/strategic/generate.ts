// Local type definitions to satisfy linter without installing @cloudflare/workers-types
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { count = 1, persona = 'Specialist' } = await context.request.json() as any;

        const generated = [];

        // Realistic Korean Names
        const firstNames = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Yoon", "Jang", "Lim", "Han"];
        const lastNames = ["Min-su", "Ji-won", "Do-hyun", "Seo-yoon", "Ha-eun", "Jun-ho", "Ji-min", "Ye-jun", "So-yoon"];

        const stmt = context.env.DB.prepare(
            `INSERT INTO project_staff (id, company_id, name, target_persona, daily_work_hours, risk_level) VALUES (?, ?, ?, ?, ?, ?)`
        );

        const inputs = [];

        for (let i = 0; i < count; i++) {
            const id = crypto.randomUUID();
            const randFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
            const randLast = lastNames[Math.floor(Math.random() * lastNames.length)];
            const name = `${randFirst} ${randLast}`;

            // Randomly assign to ELUON or ELUON INS for demo purposes if not specified
            const companyId = Math.random() > 0.5 ? 'comp_eluon' : 'comp_eluonins';

            inputs.push({
                id, companyId, name, target_persona: persona,
                daily_work_hours: "09:00-18:00",
                risk_level: Math.random() > 0.9 ? "high" : "low" // Risk is internal metric
            });
        }

        const stmts = inputs.map(g => stmt.bind(g.id, g.companyId, g.name, g.target_persona, g.daily_work_hours, g.risk_level));
        
        if (stmts.length > 0) {
            await context.env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, count: inputs.length, generated: inputs }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
