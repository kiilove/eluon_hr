import { ProcessedWorkLog } from '../../../types';
import { TimeUtils } from '../../../lib/timeUtils';

interface Env {
    DB: any; // D1Database
}

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json() as any;

        let logs: ProcessedWorkLog[] = [];
        let contextCompanyId: string = '';

        if (Array.isArray(body)) {
            // Legacy support (though we fixed frontend, safe to have fallback)
            logs = body;
        } else if (body.logs) {
            logs = body.logs;
            contextCompanyId = body.companyId;
        }

        if (!logs || !Array.isArray(logs) || logs.length === 0) {
            return new Response(JSON.stringify({ success: false, message: 'No logs provided' }), { status: 400 });
        }

        // [Security] If companyId is provided, enforce it.
        // This prevents "Eluon INS" admin from accidentally matching "Eluon" employees.
        if (!contextCompanyId) {
            // Optional: Fail here if strict mode is desired, but for now log warning
            console.warn("[Save] No companyId provided in request context! Name collision risk.");
        }

        // 1. Get all relevant employee names from the logs
        const logUserNames = Array.from(new Set(logs.map(l => l.userName).filter(Boolean)));

        if (logUserNames.length === 0) {
            return new Response(JSON.stringify({ success: true, message: 'No valid user names in logs.' }), { status: 200 });
        }

        // 2. Fetch IDs for these employees
        // [Fix] Filter by Company ID if provided
        let query = "SELECT id, name, company_id FROM regular_employees";
        let params: any[] = [];

        if (contextCompanyId) {
            query += " WHERE company_id = ?";
            params.push(contextCompanyId);
        }

        const { results: allEmployees } = await env.DB.prepare(query).bind(...params).all();

        const employeeMap = new Map<string, { id: string, companyId: string }>(); // Name -> { ID, CompanyID }
        (allEmployees as any[]).forEach(e => employeeMap.set(e.name, { id: e.id, companyId: e.company_id || 'comp_eluon' }));

        // 3. Identify Target Dates for "Full Refresh"
        const uniqueDates = Array.from(new Set(logs.map(l => l.date))).sort();

        // 4. Prepare Batch Statements
        const statements = [];

        // Step 4.0: Check for Monthly Lock
        for (const date of uniqueDates) {
            const month = date.substring(0, 7); // YYYY-MM
            const lockCheck = await env.DB.prepare("SELECT is_locked FROM monthly_closings WHERE month = ?").bind(month).first();
            if (lockCheck?.is_locked) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `마감된 월(${month})의 데이터는 수정할 수 없습니다. 관리자에게 문의하세요.`
                }), { status: 403 });
            }
        }

        // Step 4.1: DELETE existing logs for the target dates specific to the users being updated
        // [Optimization] We can skip this single-item loop if we do batch deletes below
        // But the logic below is robust. Let's keep the batch logic.

        // Step 4.2: INSERT new logs (Bulk Insert Optimization)
        const savedCount = logs.length;
        const validLogs = logs.filter(l => employeeMap.has(l.userName));
        const skippedCount = logs.length - validLogs.length;

        // Group by Employee for Efficient DELETE
        const logsByEmp = new Map<string, string[]>(); // EmpID -> Dates[]
        for (const log of validLogs) {
            const emp = employeeMap.get(log.userName);
            if (!emp) continue;

            // [Double Check] If contextCompanyId is set, ensure emp matches (redundant but safe)
            if (contextCompanyId && emp.companyId !== contextCompanyId) {
                console.warn(`[Skip] Employee ${log.userName} belongs to ${emp.companyId}, expected ${contextCompanyId}`);
                continue;
            }

            if (!logsByEmp.has(emp.id)) logsByEmp.set(emp.id, []);
            logsByEmp.get(emp.id)!.push(log.date);
        }

        // Batch 1: Deletes
        const deleteOps: any[] = [];
        for (const [eid, dates] of logsByEmp.entries()) {
            const DATE_CHUNK = 40;
            for (let i = 0; i < dates.length; i += DATE_CHUNK) {
                const chunk = dates.slice(i, i + DATE_CHUNK);
                const placeholders = chunk.map(() => '?').join(',');
                deleteOps.push(
                    env.DB.prepare(`DELETE FROM work_logs WHERE employee_id = ? AND work_date IN (${placeholders})`)
                        .bind(eid, ...chunk)
                );
            }
        }

        // Execute Deletes in Batches
        const OPS_BATCH_SIZE = 10;
        for (let i = 0; i < deleteOps.length; i += OPS_BATCH_SIZE) {
            await env.DB.batch(deleteOps.slice(i, i + OPS_BATCH_SIZE));
        }

        // Batch 2: Bulk Inserts
        const INSERT_CHUNK_SIZE = 8;
        const insertOps: any[] = [];

        // Re-filter validLogs to respect the double check above?
        // Actually validLogs was just "map has name".
        // Let's iterate validLogs and check map again.
        const finalLogsToInsert = validLogs.filter(log => {
            const emp = employeeMap.get(log.userName);
            return emp && (!contextCompanyId || emp.companyId === contextCompanyId);
        });

        for (let i = 0; i < finalLogsToInsert.length; i += INSERT_CHUNK_SIZE) {
            const chunk = finalLogsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
            const valuePlaceholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(', ');

            const flattenedValues = chunk.flatMap(log => {
                const emp = employeeMap.get(log.userName)!;
                const startTimeStr = log.rawStartTimeStr || TimeUtils.minutesToColonFormat(log.startTime || 0);
                const endTimeStr = log.rawEndTimeStr || TimeUtils.minutesToColonFormat(log.endTime || 0);
                const weekKey = TimeUtils.getWeekKey(log.date);

                return [
                    crypto.randomUUID(),
                    emp.id,
                    log.date,
                    startTimeStr,
                    endTimeStr,
                    log.status || 'NORMAL',
                    log.logStatus || 'NORMAL',
                    log.overtimeDuration || 0,
                    log.actualWorkDuration || 0,
                    weekKey,
                    Math.floor(Date.now() / 1000),
                    emp.companyId // [NEW] Insert Company ID (Confirmed from Map)
                ];
            });

            insertOps.push(
                env.DB.prepare(`
                    INSERT INTO work_logs (
                        id, employee_id, work_date, start_time, end_time, 
                        status, log_status, overtime_minutes, actual_work_minutes, week_key, created_at, company_id
                    ) VALUES ${valuePlaceholders}
                `).bind(...flattenedValues)
            );
        }

        // Execute Inserts
        for (let i = 0; i < insertOps.length; i += OPS_BATCH_SIZE) {
            await env.DB.batch(insertOps.slice(i, i + OPS_BATCH_SIZE));
        }

        let message = `Successfully saved ${finalLogsToInsert.length} logs.`;
        if (skippedCount > 0) {
            message += ` (Skipped ${skippedCount} logs for unknown employees)`;
        }

        return new Response(JSON.stringify({
            success: true,
            message: message,
            skipped: skippedCount,
            saved: finalLogsToInsert.length
        }), { status: 200 });

    } catch (err: any) {
        console.error('Save logs error:', err);
        return new Response(JSON.stringify({ success: false, message: err.message || String(err) }), { status: 500 });
    }
};

