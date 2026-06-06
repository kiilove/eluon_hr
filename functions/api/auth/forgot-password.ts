interface Env {
    DB: any;
}

export const onRequestPost: any = async (context: any) => {
    try {
        const { email } = await context.request.json();

        if (!email) {
            return new Response(JSON.stringify({ error: "Email is required" }), { status: 400 });
        }

        const db = context.env.DB;

        // 1. Check if user exists
        const user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (!user) {
            // Security: Don't reveal if user exists. Fake success or generic error.
            // For this internal tool, generic validation error is fine, or just success.
            // Let's return success to prevent enumeration, but maybe log it.
            return new Response(JSON.stringify({ success: true, message: "If the email exists, a PIN has been sent." }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. Generate 6-digit PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        // 3. Save to DB (Upsert)
        await db.prepare(`
            INSERT INTO password_resets (email, pin, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
            pin = excluded.pin,
            expires_at = excluded.expires_at,
            created_at = excluded.created_at
        `).bind(email, pin, expiresAt, Date.now()).run();

        // 4. Send Email (Mock -> Console Log)
        console.log(`[Forgot Password] PIN for ${email}: ${pin}`);

        return new Response(JSON.stringify({ success: true, message: "PIN sent to email." }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
