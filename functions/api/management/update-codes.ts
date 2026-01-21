interface Env {
    DB: any;
}

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { companyId, updates } = body;

        if (!companyId || !updates || !Array.isArray(updates)) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid input' }), { status: 400 });
        }

        console.log(`[UpdateCodes] Processing ${updates.length} updates for company ${companyId}`);

        let successCount = 0;
        let failCount = 0;
        const failedNames: string[] = [];

        // Allow batch processing - SQLite D1 might lock, so we can do it transactionally or sequentially.
        // D1 doesn't support complex transactions easily in raw workers without batch().
        // We'll iterate for now, or use batch if possible. Let's try sequential prepared statements for safety.

        const stmt = env.DB.prepare(`
            UPDATE regular_employees 
            SET employee_code = ? 
            WHERE name = ? AND company_id = ?
        `);

        // Prepare batch
        const batch = updates.map((u: any) => stmt.bind(u.code, u.name, companyId));

        // Execute batch
        const results = await env.DB.batch(batch);

        // Analyze results
        results.forEach((res: any, idx: number) => {
            if (res.meta.changes > 0) {
                successCount++;
            } else {
                failCount++;
                failedNames.push(updates[idx].name);
            }
        });

        console.log(`[UpdateCodes] Success: ${successCount}, Fail: ${failCount}`);

        return new Response(JSON.stringify({
            success: true,
            processed: updates.length,
            successCount,
            failCount,
            failedNames
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error('[UpdateCodes] Error:', e);
        return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500 });
    }
};
