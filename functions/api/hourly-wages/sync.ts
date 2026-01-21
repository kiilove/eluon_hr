type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;
        const { effectiveDate, items, companyId } = await context.request.json() as any;

        if (!effectiveDate || !items || !Array.isArray(items) || !companyId) {
            throw new Error("Invalid payload: effectiveDate, items, and companyId are required");
        }

        // 1. Delete existing set with same effective_date (if exists)
        const existingSet = await db.prepare(
            "SELECT id FROM hourly_wage_sets WHERE effective_date = ?"
        ).bind(effectiveDate).first();

        if (existingSet) {
            // Delete existing wage values and set
            await db.batch([
                db.prepare("DELETE FROM hourly_wage_values WHERE set_id = ?").bind(existingSet.id),
                db.prepare("DELETE FROM hourly_wage_sets WHERE id = ?").bind(existingSet.id)
            ]);
        }

        // 2. Create new Set
        const setId = crypto.randomUUID();

        await db.prepare(
            "INSERT INTO hourly_wage_sets (id, effective_date, company_id, created_at) VALUES (?, ?, ?, ?)"
        ).bind(setId, effectiveDate, companyId, Date.now()).run();

        // 2. Fetch Employees for Matching (Scoped by Company)
        const employees = await db.prepare("SELECT id, name FROM regular_employees WHERE company_id = ?").bind(companyId).all();
        const empMap = new Map<string, string>();
        if (employees.results) {
            employees.results.forEach((e: any) => empMap.set(e.name, e.id));
        }

        const stmts = [];
        const newEmployees = [];
        const wageItems = [];

        // 3. Process Items
        for (const item of items) {
            let empId = empMap.get(item.name);

            // Auto-create employee if not exists
            if (!empId) {
                empId = crypto.randomUUID();

                // Create employee record with extended details
                stmts.push(db.prepare(
                    `INSERT INTO regular_employees (id, name, company_id, department, position, employee_code, source, created_at, last_synced_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    empId,
                    item.name,
                    companyId,
                    item.department || null,
                    item.position || null,
                    item.employeeCode || null,
                    'hourly_wage_upload',
                    Date.now(),
                    Date.now()
                ));

                newEmployees.push(item.name);
                empMap.set(item.name, empId); // Update map to avoid double creation in same batch
            }

            // [New] Implicit Status History: Wage = Active
            // We adding a status history record marking them as 'ACTIVE' from this effective date.
            // Check if we should deduplicate? For now, we'll use INSERT OR IGNORE if we had a unique constraint, 
            // but we don't on (employee_id, effective_date). 
            // Let's just insert. It verifies they were active as of this date.
            stmts.push(db.prepare(
                `INSERT INTO employee_status_history (id, employee_id, status, effective_date, reason, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                empId,
                'ACTIVE',
                effectiveDate,
                'Hourly Wage Upload (Implicit)',
                Date.now()
            ));

            wageItems.push({
                set_id: setId,
                employee_id: empId,
                amount: item.amount
            });
        }

        // 4. Batch Insert Wages
        const wageStmts = wageItems.map(w =>
            db.prepare(
                "INSERT INTO hourly_wage_values (set_id, employee_id, amount) VALUES (?, ?, ?)"
            ).bind(w.set_id, w.employee_id, w.amount)
        );

        await db.batch([...stmts, ...wageStmts]);

        return new Response(JSON.stringify({
            success: true,
            setId,
            createdCount: wageItems.length,
            newEmployees
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
};
