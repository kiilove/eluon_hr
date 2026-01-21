// functions/api/employees/status.ts

type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const employeeId = url.searchParams.get("employeeId");
        const companyId = url.searchParams.get("companyId");

        if (!employeeId && !companyId) {
            return new Response(JSON.stringify({ error: "Either employeeId or companyId is required" }), { status: 400 });
        }

        let query = `
            SELECT h.*, e.name as employee_name, e.department, e.position 
            FROM employee_status_history h
            JOIN regular_employees e ON h.employee_id = e.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (employeeId) {
            query += " AND h.employee_id = ?";
            params.push(employeeId);
        }

        if (companyId) {
            query += " AND e.company_id = ?";
            params.push(companyId);
        }

        query += " ORDER BY h.effective_date DESC, h.created_at DESC";

        const { results } = await context.env.DB.prepare(query).bind(...params).all();

        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body = await context.request.json() as any;
        const { employeeId, status, effectiveDate, reason } = body;

        if (!employeeId || !status || !effectiveDate) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const id = crypto.randomUUID();
        await context.env.DB.prepare(
            "INSERT INTO employee_status_history (id, employee_id, status, effective_date, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, employeeId, status, effectiveDate, reason || null, Date.now()).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get("id");

        if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });

        await context.env.DB.prepare("DELETE FROM employee_status_history WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
