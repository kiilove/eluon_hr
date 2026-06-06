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

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { employeeId, amount, effectiveDate, companyId } = await context.request.json() as any;

        if (!employeeId || amount === undefined || !effectiveDate || !companyId) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const db = context.env.DB;

        // 1. Find or Create Wage Set for the Date
        let set = await db.prepare("SELECT id FROM hourly_wage_sets WHERE effective_date = ? AND company_id = ?").bind(effectiveDate, companyId).first();
        let setId = set?.id;

        if (!setId) {
            setId = crypto.randomUUID();
            await db.prepare("INSERT INTO hourly_wage_sets (id, effective_date, company_id, created_at) VALUES (?, ?, ?, ?)").bind(setId, effectiveDate, companyId, Date.now()).run();
        }

        // 2. Insert or Update Wage Value
        // Check if value exists
        const existingValue = await db.prepare("SELECT id FROM hourly_wage_values WHERE set_id = ? AND employee_id = ?").bind(setId, employeeId).first();

        if (existingValue) {
            await db.prepare("UPDATE hourly_wage_values SET amount = ? WHERE id = ?").bind(amount, existingValue.id).run();
        } else {
            await db.prepare("INSERT INTO hourly_wage_values (set_id, employee_id, amount) VALUES (?, ?, ?)").bind(setId, employeeId, amount).run();
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};
