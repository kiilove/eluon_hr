interface Env {
    DB: any;
}

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { month, action = "lock" } = body; // YYYY-MM, action: 'lock' | 'unlock'
        const isLockValue = action === 'unlock' ? 0 : 1;

        if (!month) {
            return new Response(JSON.stringify({ success: false, message: 'Month is required' }), { status: 400 });
        }

        console.log(`[ApprovalAPI] Action: ${action} (${isLockValue}) Month: ${month}`);

        // 1. Update Monthly Closing Status (Main Switch)
        await env.DB.prepare(`
            INSERT INTO monthly_closings (month, is_locked, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(month) DO UPDATE SET
                is_locked = excluded.is_locked,
                updated_at = excluded.updated_at
        `).bind(month, isLockValue, Date.now()).run();

        // 2. Row-Level Locking (As requested by user: "is_lock" field update)
        // Calculate Date Range
        const [year, m] = month.split('-');
        const startDt = new Date(parseInt(year), parseInt(m) - 1, 1);
        const endDt = new Date(parseInt(year), parseInt(m), 1);
        const format = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const sStr = format(startDt);
        const eStr = format(endDt); // Exclusive upper bound

        // Try Update Rows. We wrap in Try/Catch in case column missing (though User said it exists)
        try {
            const q1 = `UPDATE work_logs SET is_lock = ? WHERE work_date >= ? AND work_date < ?`;
            const q2 = `UPDATE special_work_logs SET is_lock = ? WHERE work_date >= ? AND work_date < ?`;

            await env.DB.prepare(q1).bind(isLockValue, sStr, eStr).run();
            await env.DB.prepare(q2).bind(isLockValue, sStr, eStr).run();
            console.log(`[ApprovalAPI] Row-level locks set to ${isLockValue} for ${sStr} to ${eStr}`);
        } catch (rowErr: any) {
            console.warn(`[ApprovalAPI] Row-level lock failed (Column might be missing): ${rowErr.message}`);
            // We do NOT fail the request, as the Month Lock is the primary enforcement mechanism.
        }

        return new Response(JSON.stringify({
            success: true,
            month,
            isLocked: isLockValue === 1
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
