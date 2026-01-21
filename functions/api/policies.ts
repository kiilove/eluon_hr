// Cloudflare Pages Function Types
interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    meta: any;
    error?: string;
}

interface D1ExecResult {
    count: number;
    duration: number;
}

interface EventContext<Env, P extends string, Data> {
    request: Request;
    env: Env;
    params: Record<P, string>;
    data: Data;
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
}

type PagesFunction<Env = unknown> = (
    context: EventContext<Env, any, Record<string, unknown>>
) => Response | Promise<Response>;

interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const companyId = url.searchParams.get('companyId');

        if (!companyId) return new Response(JSON.stringify({ error: "Company ID is required" }), { status: 400 });

        const { results } = await context.env.DB.prepare(
            "SELECT * FROM work_policies WHERE company_id = ? ORDER BY effective_date DESC"
        ).bind(companyId).all();

        return new Response(JSON.stringify(results || []), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const {
            companyId = 'comp_eluon',
            effectiveDate,
            standardStartTime,
            standardEndTime,
            breakTime4hDeduction,
            breakTime8hDeduction,
            clockInGraceMinutes,
            clockInCutoffTime,
            clockOutCutoffTime,
            maxWeeklyOvertimeMinutes,
            weeklyBasicWorkMinutes
        } = payload;

        if (!effectiveDate) {
            return new Response(JSON.stringify({ error: "Effective Date is required" }), { status: 400 });
        }

        const id = crypto.randomUUID();

        await context.env.DB.prepare(
            `INSERT INTO work_policies (
                id, company_id, effective_date, 
                standard_start_time, standard_end_time,
                break_time_4h_deduction, break_time_8h_deduction,
                clock_in_grace_minutes, clock_in_cutoff_time, clock_out_cutoff_time,
                max_weekly_overtime_minutes, weekly_basic_work_minutes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            id, companyId, effectiveDate,
            standardStartTime || '09:00', standardEndTime || '18:00',
            breakTime4hDeduction ?? 30, breakTime8hDeduction ?? 60,
            clockInGraceMinutes ?? 0, clockInCutoffTime, clockOutCutoffTime,
            maxWeeklyOvertimeMinutes ?? 720, weeklyBasicWorkMinutes ?? 2400, Date.now()
        ).run();

        return new Response(JSON.stringify({ success: true, id }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
    try {
        const payload = await context.request.json() as any;
        const {
            id,
            effectiveDate,
            standardStartTime,
            standardEndTime,
            breakTime4hDeduction,
            breakTime8hDeduction,
            clockInGraceMinutes,
            clockInCutoffTime,
            clockOutCutoffTime,
            maxWeeklyOvertimeMinutes,
            weeklyBasicWorkMinutes
        } = payload;

        if (!id) return new Response(JSON.stringify({ error: "ID is required" }), { status: 400 });

        // Build simple update query
        await context.env.DB.prepare(
            `UPDATE work_policies SET
                effective_date = ?, 
                standard_start_time = ?, standard_end_time = ?,
                break_time_4h_deduction = ?, break_time_8h_deduction = ?,
                clock_in_grace_minutes = ?, clock_in_cutoff_time = ?, clock_out_cutoff_time = ?,
                max_weekly_overtime_minutes = ?, weekly_basic_work_minutes = ?
            WHERE id = ?`
        ).bind(
            effectiveDate,
            standardStartTime, standardEndTime,
            breakTime4hDeduction, breakTime8hDeduction,
            clockInGraceMinutes, clockInCutoffTime, clockOutCutoffTime,
            maxWeeklyOvertimeMinutes, weeklyBasicWorkMinutes ?? 2400,
            id
        ).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get('id');

        if (!id) return new Response("Missing ID", { status: 400 });

        await context.env.DB.prepare("DELETE FROM work_policies WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
