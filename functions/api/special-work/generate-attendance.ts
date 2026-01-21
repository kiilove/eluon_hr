import { SpecialWorkAttendanceGenerator } from '../../engine/specialWorkAttendanceGenerator';
import { SpecialWorkCalculator } from '../../../lib/specialWorkCalculator';

import { TimeUtils } from '../../../lib/timeUtils';

type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const db = context.env.DB;
        const body = await context.request.json() as any;
        const { reportId, save, targetEmployeeIds, providedLogs, companyId } = body;

        if (!reportId || !companyId) {
            return new Response(JSON.stringify({ success: false, message: "reportId and companyId are required" }), { status: 400 });
        }

        // Fetch Report Early (Needed for both generation and saving/cleanup)
        const report = await db.prepare("SELECT * FROM special_work_reports WHERE id = ?").bind(reportId).first();
        if (!report) throw new Error("Report not found");

        let generatedLogs = [];
        const targets: Record<string, number> = {};

        // 1. Use Provided Logs (WYSIWYG) OR Generate New
        if (providedLogs && Array.isArray(providedLogs) && providedLogs.length > 0) {
            console.log(`[Sync] Using ${providedLogs.length} provided logs (WYSIWYG)`);
            generatedLogs = providedLogs;
        } else {
            // [Existing Generation Logic]
            console.log('[Generate] Fetching records for reportId:', reportId, 'companyId:', companyId);
            const records = await db.prepare(`
                SELECT r.*, e.name as employee_name
                FROM special_work_employee_records r
                LEFT JOIN regular_employees e ON r.employee_id = e.id
                WHERE r.report_id = ? AND e.company_id = ?
            `).bind(reportId, companyId).all();

            console.log('[Generate] Records fetched:', records.results?.length || 0);
            if (records.results?.length > 0) {
                console.log('[Generate] First record sample:', JSON.stringify(records.results[0]));
            }

            // Fetch Policy for Month (simplify: use latest policy effective on or before report's end of month)
            const targetDate = `${report.target_month}-28`;

            const policy = await db.prepare(`
                SELECT * FROM work_policies 
                WHERE company_id = ? AND effective_date <= ? 
                ORDER BY effective_date DESC 
                LIMIT 1
            `).bind(companyId, targetDate).first();

            console.log('[Generate] Policy found:', !!policy, 'for date:', targetDate);

            const maxOvertime = policy?.max_weekly_overtime_minutes || 12 * 60;
            const break4h = policy?.break_time_4h_deduction !== undefined ? policy.break_time_4h_deduction : 30;
            const break8h = policy?.break_time_8h_deduction !== undefined ? policy.break_time_8h_deduction : 60;

            // 2. Generate for each record
            let processedCount = 0;
            let skippedCount = 0;
            for (const record of records.results) {
                // Apply Partial Filter
                if (targetEmployeeIds && Array.isArray(targetEmployeeIds) && targetEmployeeIds.length > 0) {
                    if (!targetEmployeeIds.includes(record.employee_id)) {
                        console.log('[Generate] Skipped (not in target list):', record.employee_name);
                        skippedCount++;
                        continue;
                    }
                }

                if (!record.calculated_hours || record.calculated_hours <= 0) {
                    console.log('[Generate] Skipped (no hours):', record.employee_name, 'hours:', record.calculated_hours);
                    skippedCount++;
                    continue;
                }

                // [Fix] Round target hours to nearest integer to reflect "Recognized Hours" logic
                // using Unified Calculator
                // calculated_hours is in hours, so * 60 to get minutes
                const roundedTarget = SpecialWorkCalculator.toRecognizedHours(record.calculated_hours * 60);
                if (roundedTarget === 0) {
                    console.log('[Generate] Skipped (rounded to 0):', record.employee_name, 'original:', record.calculated_hours);
                    skippedCount++;
                    continue;
                }

                console.log('[Generate] Processing:', record.employee_name, 'hours:', roundedTarget);
                targets[record.employee_id] = roundedTarget;

                const result = SpecialWorkAttendanceGenerator.generate({
                    targetMonth: report.target_month,
                    totalHours: roundedTarget,
                    employeeName: record.employee_name,
                    maxWeeklyOvertime: maxOvertime,
                    breakTime4h: break4h,
                    breakTime8h: break8h
                });

                // Map to flat list with user info
                result.logs.forEach(l => {
                    generatedLogs.push({
                        ...l,
                        employeeId: record.employee_id,
                        employeeName: record.employee_name,
                        persona: result.personaName,
                        weekKey: TimeUtils.getWeekKey(l.date)
                    });
                });
                processedCount++;
            }
            console.log('[Generate] Summary - Processed:', processedCount, 'Skipped:', skippedCount, 'Total logs:', generatedLogs.length);
        }

        // 3. Save to Special Work Logs (Dual Table)
        if (save) {
            // Check if month is locked
            const monthKey = report.target_month; // Format: YYYY-MM
            const closing = await db.prepare(
                "SELECT is_locked FROM monthly_closings WHERE month = ?"
            ).bind(monthKey).first();

            if (closing && closing.is_locked === 1) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `${monthKey} 월은 마감되어 근태 데이터를 생성할 수 없습니다.`
                }), { status: 400 });
            }

            // [Fix] Cleanup Orphans Strategy
            // Since we are regenerating for this month, we should wipe previous data for this month
            // to prevents orphans from deleted reports or reduced log counts.
            const [y, m] = report.target_month.split('-').map(Number);
            const mStart = `${report.target_month}-01`;
            const nextM = new Date(y, m, 1); // Next month 1st
            const mEnd = nextM.toISOString().slice(0, 10); // Exclusive logic usually, but let's strictly handle range

            // Delete all SPECIAL logs for this month AND this company before re-inserting
            await db.prepare(`
                DELETE FROM special_work_logs 
                WHERE work_date >= ? AND work_date < ? 
                AND company_id = ?
            `).bind(mStart, mEnd, companyId).run();

            const stmts = [];
            for (const log of generatedLogs) {
                // Calculate Minutes
                const [sh, sm] = log.startTime.split(':').map(Number);
                const [eh, em] = log.endTime.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;

                // Actual Work
                let duration = endMin - startMin;
                let actualWork = Math.max(0, duration - log.breakMinutes);

                const weekKey = TimeUtils.getWeekKey(log.date);

                stmts.push(
                    db.prepare(`
                        INSERT INTO special_work_logs (
                            id, report_id, employee_id, work_date, 
                            start_time, end_time, break_minutes, actual_work_minutes, 
                            log_status, persona, week_key, 
                            status, overtime_minutes, 
                            created_at, company_id
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(employee_id, work_date) DO UPDATE SET
                            start_time = excluded.start_time,
                            end_time = excluded.end_time,
                            break_minutes = excluded.break_minutes,
                            actual_work_minutes = excluded.actual_work_minutes,
                            log_status = excluded.log_status,
                            persona = excluded.persona,
                            week_key = excluded.week_key,
                            status = excluded.status,
                            overtime_minutes = excluded.overtime_minutes,
                            updated_at = ?,
                            company_id = excluded.company_id
                    `).bind(
                        crypto.randomUUID(),
                        reportId,
                        log.employeeId,
                        log.date,
                        log.startTime,
                        log.endTime,
                        log.breakMinutes,
                        actualWork,
                        'SPECIAL',
                        log.persona,
                        weekKey,
                        'NORMAL',   // status (Unified)
                        actualWork, // overtime_minutes (Unified: Special work is 100% overtime-ish, or at least tracked here)
                        Date.now(),
                        companyId, // [NEW] Insert Company ID
                        Date.now()
                    )
                );
            }

            // Batch Execution
            const BATCH_SIZE = 50;
            for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
                await db.batch(stmts.slice(i, i + BATCH_SIZE));
            }
        }

        return new Response(JSON.stringify({
            success: true,
            count: generatedLogs.length,
            preview: generatedLogs,
            targets
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, message: (e as Error).message }), { status: 500 });
    }
};
