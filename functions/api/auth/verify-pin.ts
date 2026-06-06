interface Env {
    DB: any;
}

export const onRequestPost: any = async (context: any) => {
    try {
        const { email, pin } = await context.request.json();

        if (!email || !pin) {
            return new Response(JSON.stringify({ error: "Email and PIN are required" }), { status: 400 });
        }

        const db = context.env.DB;

        // 1. Verify PIN
        const record = await db.prepare("SELECT * FROM password_resets WHERE email = ? AND pin = ?").bind(email, pin).first();

        if (!record) {
            return new Response(JSON.stringify({ error: "Invalid PIN" }), { status: 400 });
        }

        if (record.expires_at < Date.now()) {
            return new Response(JSON.stringify({ error: "PIN expired" }), { status: 400 });
        }

        // Just return success. The client proceeds to the "New Password" screen.
        // The actual reset endpoint will re-verify the PIN before changing the password.

        return new Response(JSON.stringify({ success: true, message: "PIN Verified" }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
