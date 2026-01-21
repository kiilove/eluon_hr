
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;
        const url = new URL(context.request.url);
        const id = url.searchParams.get('id');

        if (id) {
            // Get Detail
            const report = await db.prepare("SELECT * FROM special_work_reports WHERE id = ?").bind(id).first();
            if (!report) {
                return new Response(JSON.stringify({ success: false, message: "Report not found" }), { status: 404 });
            }

            // Get Detail with Records & Items
            const records = await db.prepare(`
                SELECT r.*, e.name as employee_name, e.position as employee_position, e.department as employee_department
                FROM special_work_employee_records r
                LEFT JOIN regular_employees e ON r.employee_id = e.id
                WHERE r.report_id = ?
                ORDER BY e.name ASC
            `).bind(id).all();

            const items = await db.prepare(`
                SELECT * FROM special_work_items WHERE report_id = ? ORDER BY work_date ASC
            `).bind(id).all();

            // Get Attendance Logs
            const logs = await db.prepare(`
                SELECT * FROM special_work_logs WHERE report_id = ? ORDER BY work_date ASC, start_time ASC
            `).bind(id).all();

            // Structure Data: Attach items to records
            const recordMap = new Map();
            records.results.forEach((rec: any) => {
                rec.items = [];
                recordMap.set(rec.id, rec);
            });

            items.results.forEach((item: any) => {
                if (item.record_id && recordMap.has(item.record_id)) {
                    recordMap.get(item.record_id).items.push(item);
                }
            });

            return new Response(JSON.stringify({
                success: true,
                data: {
                    ...report,
                    records: Array.from(recordMap.values()),
                    logs: logs.results || []
                }
            }), { headers: { "Content-Type": "application/json" } });
        } else {
            // Get List
            const month = new URL(context.request.url).searchParams.get('month');
            const companyId = new URL(context.request.url).searchParams.get('companyId');

            let query = `
                SELECT 
                    r.*, 
                    (SELECT COUNT(*) FROM special_work_items WHERE report_id = r.id) as item_count 
                FROM special_work_reports r 
                WHERE 1=1
            `;

            const params: any[] = [];

            // [Security] Filter by Company
            if (companyId) {
                // Ensure report involves employees of this company
                // Since reports are tenant-isolated by creation, checking one employee or the creator (if tracked) is enough.
                // We check if ANY item in the report belongs to an employee of this company.
                // Or better, we can assume reports are created by users of the company. 
                // But we don't store creator company in report table.
                // So checking items is the most robust way given current schema.
                // "Select reports where exists an item with employee in this company"
                query += ` AND EXISTS (
                    SELECT 1 FROM special_work_items i 
                    JOIN regular_employees e ON i.employee_id = e.id 
                    WHERE i.report_id = r.id AND e.company_id = ?
                )`;
                params.push(companyId);
            }

            if (id) {
                query += " AND id = ?";
                params.push(id);
            } else if (month) {
                query += " AND target_month = ?";
                params.push(month);
            }

            query += " ORDER BY r.created_at DESC";

            const stmt = db.prepare(query);
            const results = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

            return new Response(JSON.stringify({ success: true, data: results.results }), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;
        const url = new URL(context.request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return new Response(JSON.stringify({ success: false, message: "ID is required" }), { status: 400 });
        }

        // Manual delete to be safe regarding FK enforcement
        // Delete in correct order: items -> records -> logs -> report
        await db.prepare("DELETE FROM special_work_items WHERE report_id = ?").bind(id).run();
        await db.prepare("DELETE FROM special_work_employee_records WHERE report_id = ?").bind(id).run();
        await db.prepare("DELETE FROM special_work_logs WHERE report_id = ?").bind(id).run(); // [Fix] Delete Time Logs too
        const result = await db.prepare("DELETE FROM special_work_reports WHERE id = ?").bind(id).run();

        if (result.success) {
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        } else {
            return new Response(JSON.stringify({ success: false, message: "Failed to delete" }), { status: 500 });
        }

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: (e as Error).message }), { status: 500 });
    }
};
