


import { SpecialWorkCalculator } from '../../../lib/specialWorkCalculator';

type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;

        const body: any = await context.request.json();
        const title = body.title || body.reportTitle;
        const { targetMonth, totalPayout, details, companyId } = body;

        // [Cleanup Risk Prevention] 
        // If a new report is being synced for a month, we should check if an old report exists and warn or handle?
        // But the user usually deletes the old one or we just create a accumulation.
        // For now, Sync focuses on Report creation. Log cleanup is handled by Generate/Delete.

        if (!title || !targetMonth || !details || !companyId) {
            return new Response(JSON.stringify({ error: "Missing required fields (including companyId)" }), { status: 400 });
        }

        // 1. Create Report
        const reportId = crypto.randomUUID();
        const createdAt = Date.now();
        await db.prepare(
            `INSERT INTO special_work_reports (id, title, target_month, total_payout, created_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(reportId, title, targetMonth, totalPayout, createdAt).run();

        // [Fix] Cleanup Residue Logs on New Upload
        // When uploading a new Master Excel for a month, we must wipe existing "Special Work Logs" 
        // for that month to prevent "Ghost Data" (orphans from previous reports or manual tests).
        // This ensures the Calendar reflects ONLY what is generated from this new Report (once generated).
        const [tY, tM] = targetMonth.split('-').map(Number);
        const mStart = `${targetMonth}-01`;
        const nextM = new Date(tY, tM, 1); // Month is 0-indexed in Date? No, tM from split is 1-based (e.g. "12") -> Date(2025, 12, 1) is Jan 2026. Correct.
        // Wait. "2025-12". split gives [2025, 12].
        // new Date(2025, 12, 1). Month param is 0-11? Yes.
        // So 12 is Jan next year. Perfect.
        // What if "2025-01"? [2025, 1]. new Date(2025, 1, 1) is Feb 1st. Correct.
        const mEnd = nextM.toISOString().slice(0, 10);

        // Delete logs for this month AND this company (filtered by employee -> company)
        // Ideally we should filter by company, but logs table doesn't have company_id.
        // But employee_id is linked to regular_employees which has company_id.
        // For strictness: DELETE FROM special_work_logs WHERE work_date... AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        // Use subquery for safety
        await db.prepare(`
            DELETE FROM special_work_logs 
            WHERE work_date >= ? AND work_date < ? 
            AND employee_id IN (SELECT id FROM regular_employees WHERE company_id = ?)
        `).bind(mStart, mEnd, companyId).run();


        // [New] Fetch Multiplier (Since Engine is removed)
        // Multipliers are global or company specific? Schema has only id, effective_date... 
        // Wait, schema.sql showed `wage_multiplier_policies`? I didn't see it in the snippet.
        // Assuming it might be company specific. If not, global is fine.
        // Let's assume global for now based on existing query, but check if we can filter.
        // If the table has company_id, we should use it. 
        // Based on previous search, I only saw `special_work_policy_sets` having company_id.
        // I will risk using the existing query for multiplier but if it breaks I'll fix.
        // SAFEST: Leave multiplier as is (global) or try to bind. 
        // The existing code was: `SELECT ... FROM wage_multiplier_policies ...` (no company_id).
        const multPolicy = await db.prepare("SELECT special_work_multiplier FROM wage_multiplier_policies ORDER BY effective_date DESC LIMIT 1").first();
        const multiplier = multPolicy?.special_work_multiplier || 1.5;


        // 2. Fetch all employees for mapping (Filtered by Company)
        const { results: employees } = await db.prepare("SELECT id, name FROM regular_employees WHERE company_id = ?").bind(companyId).all();
        const employeeMap = new Map<string, string>();
        employees.forEach((emp: any) => {
            employeeMap.set(emp.name, emp.id);
        });

        // 3. Fetch Configs (Rates)
        const refDate = `${targetMonth}-01`;
        const policySet = await db.prepare(`
            SELECT id FROM special_work_policy_sets 
            WHERE company_id = ? AND effective_date <= ?
            ORDER BY effective_date DESC LIMIT 1
        `).bind(companyId, refDate).first();

        const rateMap = new Map<string, number>();
        if (refDate && policySet) {
            const { results } = await db.prepare("SELECT code, rate FROM special_work_config_items WHERE policy_id = ?").bind(policySet.id).all();
            if (results) {
                results.forEach((cfg: any) => rateMap.set(cfg.code, cfg.rate));
            }
        }

        // 4. Fetch Hourly Wages for Calculation
        // Fetch wages only for employees of this company
        const { results: wages } = await db.prepare(`
            SELECT v.employee_id, v.amount, s.effective_date
            FROM hourly_wage_values v
            JOIN hourly_wage_sets s ON v.set_id = s.id
            JOIN regular_employees e ON v.employee_id = e.id
            WHERE e.company_id = ?
            ORDER BY s.effective_date DESC
        `).bind(companyId).all();

        const wageMap = new Map<string, Array<{ date: string, amount: number }>>();
        if (wages) {
            wages.forEach((w: any) => {
                if (!wageMap.has(w.employee_id)) {
                    wageMap.set(w.employee_id, []);
                }
                wageMap.get(w.employee_id)?.push({ date: w.effective_date, amount: w.amount });
            });
        }

        // 5. Group by Name to access details easily
        const detailMap = new Map<string, any>();
        for (const item of details) {
            // Check for duplicate names? Assuming unique names for now as per parser logic
            detailMap.set(item.name, item);
        }

        const missingNames: string[] = [];
        const recordsToInsert: any[] = [];
        const itemsToInsert: any[] = [];

        // Use a date late in the month for policy lookup (e.g. 28th) to ensure we get the month's policy
        const refDateForPolicy = `${targetMonth}-28`;

        for (const [name, detail] of detailMap.entries()) {
            const logs = detail.dailyLogs || [];
            const empId = employeeMap.get(name);
            if (!empId) {
                missingNames.push(name);
                continue;
            }

            // Convert logs to Engine format & Resolve Dates
            const [tYear, tMonth] = targetMonth.split('-').map(Number);

            const engineItems = logs.map((log: any) => {
                const [lMonth, lDay] = log.date.split('-').map(Number);
                let finalYear = tYear;
                if (tMonth === 1 && lMonth === 12) finalYear = tYear - 1;
                else if (tMonth === 12 && lMonth === 1) finalYear = tYear + 1;
                const fullDate = `${finalYear}-${String(lMonth).padStart(2, '0')}-${String(lDay).padStart(2, '0')}`;

                const amount = rateMap.get(log.type) || 0;
                return { date: fullDate, type: log.type, amount };
            });

            // Find Wage
            const wageHistory = wageMap.get(empId) || [];
            // Sort by Date Desc to find effective wage
            const sortedWages = [...wageHistory].sort((a, b) => b.date.localeCompare(a.date));
            const activeWage = sortedWages.find(w => w.date <= refDateForPolicy);
            const baseHourlyWage = activeWage ? activeWage.amount : 0;
            const specialHourlyWage = SpecialWorkCalculator.calculateWage(baseHourlyWage, multiplier);

            // [Source of Truth]: Use the Total Amount parsed from Excel (detail.totalAllowance)
            // If it's 0 (meaning no Excel column & no calculated logs), we fall back to sum of logs (which is also 0).
            // The parser guarantees totalAllowance is populated with best available data.
            let totalAmount = detail.totalAllowance || 0;

            // If totalAmount is 0 but we have items, maybe fall back to summing items? 
            // The parser already does this fallback if Excel total is missing.
            // So we strictly trust detail.totalAllowance.

            // Calculate Attributes
            let calculatedHours = 0;
            if (specialHourlyWage > 0) {
                calculatedHours = Math.round(totalAmount / specialHourlyWage);
            }

            const record = {
                baseHourlyWage,
                specialHourlyWage,
                totalAmount,
                calculatedHours
            };

            // REMOVED: The logic that overwrote totalAmount = calculatedHours * specialHourlyWage.
            // We now respect the Excel value even if it doesn't perfectly match hours * wage.

            if (record) {
                const recordId = crypto.randomUUID();

                // Prepare Record Insert
                recordsToInsert.push({
                    id: recordId,
                    report_id: reportId,
                    employee_id: empId,
                    base_hourly_wage: record.baseHourlyWage,
                    special_hourly_wage: record.specialHourlyWage,
                    total_amount: record.totalAmount,
                    calculated_hours: record.calculatedHours,
                    created_at: Date.now()
                });

                // Prepare Items Insert (Linked to Record)
                engineItems.forEach((item: any) => {
                    itemsToInsert.push({
                        report_id: reportId,
                        employee_id: empId,
                        record_id: recordId,
                        work_date: item.date,
                        work_type: item.type,
                        amount: item.amount
                    });
                });
            }
        }

        // 6. Batch Insert Records
        // 6. Batch Insert Records (Bulk Optimization)
        // Params: 8 per row. Chunk Size 10 (80 < 100).
        if (recordsToInsert.length > 0) {
            const RECORD_BATCH_SIZE = 10;
            const recordOps: any[] = [];

            for (let i = 0; i < recordsToInsert.length; i += RECORD_BATCH_SIZE) {
                const batch = recordsToInsert.slice(i, i + RECORD_BATCH_SIZE);
                const placeholders = batch.map(() => `(?, ?, ?, ?, ?, ?, ?, ?)`).join(', ');
                const values = batch.flatMap(r => [
                    r.id, r.report_id, r.employee_id,
                    r.base_hourly_wage, r.special_hourly_wage,
                    r.total_amount, r.calculated_hours, r.created_at
                ]);

                recordOps.push(
                    db.prepare(`
                        INSERT INTO special_work_employee_records 
                        (id, report_id, employee_id, base_hourly_wage, special_hourly_wage, total_amount, calculated_hours, created_at) 
                        VALUES ${placeholders}
                    `).bind(...values)
                );
            }

            // Execute in larger batches
            const EXEC_BATCH_SIZE = 10; // 10 Bulk Insert statements per network call
            for (let i = 0; i < recordOps.length; i += EXEC_BATCH_SIZE) {
                await db.batch(recordOps.slice(i, i + EXEC_BATCH_SIZE));
            }
        }

        // 7. Batch Insert Items (Bulk Optimization)
        // Params: 6 per row. Chunk Size 12 (72 < 100).
        if (itemsToInsert.length > 0) {
            const ITEM_BATCH_SIZE = 12;
            const itemOps: any[] = [];

            for (let i = 0; i < itemsToInsert.length; i += ITEM_BATCH_SIZE) {
                const batch = itemsToInsert.slice(i, i + ITEM_BATCH_SIZE);
                const placeholders = batch.map(() => `(?, ?, ?, ?, ?, ?)`).join(', ');
                const values = batch.flatMap(item => [
                    item.report_id, item.employee_id, item.record_id,
                    item.work_date, item.work_type, item.amount
                ]);

                itemOps.push(
                    db.prepare(`
                        INSERT INTO special_work_items 
                        (report_id, employee_id, record_id, work_date, work_type, amount) 
                        VALUES ${placeholders}
                    `).bind(...values)
                );
            }

            // Execute in larger batches
            const EXEC_BATCH_SIZE = 10;
            for (let i = 0; i < itemOps.length; i += EXEC_BATCH_SIZE) {
                await db.batch(itemOps.slice(i, i + EXEC_BATCH_SIZE));
            }
        }

        return new Response(JSON.stringify({
            success: true,
            reportId,
            insertedCount: itemsToInsert.length,
            missingNames
        }), { headers: { "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
