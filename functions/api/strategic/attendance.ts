import { generateMonthlyAttendance } from '../../../lib/engine/attendanceGenerator';

// Local type definitions
type D1Database = any;
type PagesFunction<T = any> = any;

interface Env {
    DB: D1Database;
}

// Helper to check if date is weekend
function isWeekend(date: Date) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sun or Sat
}

// Format number to 2 digits
const pad = (n: number) => n.toString().padStart(2, '0');

// POST /api/strategic/attendance - Generate Monthly Attendance
export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const { staffId, year, month } = payload; // month is 1-12

        if (!staffId || !year || !month) {
            return new Response("Missing required fields (staffId, year, month)", { status: 400 });
        }

        // 1. Fetch existing Leaves for this month to avoid conflicts
        // Calculate month start/end
        const startDate = `${year} -${pad(month)}-01`;
        const endDate = `${year} -${pad(month)} -31`; // Simple upper bound, SQLite handles date comparison stringly typed usually fine for ISO

        const { results: leaves } = await context.env.DB.prepare(
            "SELECT leave_date FROM project_staff_leaves WHERE staff_id = ? AND leave_date BETWEEN ? AND ?"
        ).bind(staffId, startDate, endDate).all();

        const leaveDates = new Set<string>(leaves.map((l: any) => l.leave_date));

        // 2. Clear existing logs for this month first (Idempotency)
        await context.env.DB.prepare(
            "DELETE FROM project_staff_work_logs WHERE staff_id = ? AND work_date BETWEEN ? AND ?"
        ).bind(staffId, startDate, endDate).run();

        // 3. Generate Logs using Engine
        // Use provided target times or default to global 09:00-18:00
        const { work_start_time = '09:00', work_end_time = '18:00' } = payload;
        const generatedLogs = generateMonthlyAttendance(staffId, year, month, leaveDates, work_start_time, work_end_time);

        // 4. Batch Insert
        if (generatedLogs.length > 0) {
            const stmt = context.env.DB.prepare(
                `INSERT INTO project_staff_work_logs(id, staff_id, work_date, start_time, end_time, status) VALUES(?, ?, ?, ?, ?, ?)`
            );
            const stmts = generatedLogs.map(l => stmt.bind(l.id, l.staff_id, l.work_date, l.start_time, l.end_time, l.status));
            await context.env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, count: generatedLogs.length, logs: generatedLogs }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

// GET /api/strategic/attendance?staffId=...&year=...&month=...
export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const staffId = url.searchParams.get('staffId');
        const year = url.searchParams.get('year');
        const month = url.searchParams.get('month');

        if (!staffId || !year || !month) return new Response("Missing params", { status: 400 });

        const startDate = `${year} -${pad(Number(month))}-01`;
        const endDate = `${year} -${pad(Number(month))} -31`;

        const { results } = await context.env.DB.prepare(
            "SELECT * FROM project_staff_work_logs WHERE staff_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date ASC"
        ).bind(staffId, startDate, endDate).all();

        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
