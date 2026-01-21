interface Env {
    DB: D1Database;
}

// Basic PBKDF2 implementation using Web Crypto API (Must match signup)
async function hashPassword(password: string, salt: string) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const exported = await crypto.subtle.exportKey("raw", key);
    return Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { email, password } = await context.request.json() as any;

        // 1. Get User Profile & Credentials
        const result = await context.env.DB.prepare(`
        SELECT u.*, uc.password_hash, uc.salt 
        FROM users u
        JOIN user_credentials uc ON u.id = uc.user_id
        WHERE u.email = ?
    `).bind(email).first();

        if (!result) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
        }

        // 2. Verify Password
        const derivedHash = await hashPassword(password, result.salt as string);
        if (derivedHash !== result.password_hash) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
        }

        // 3. Return User Info (exclude auth secrets)
        return new Response(JSON.stringify({
            success: true,
            user: {
                id: result.id,
                email: result.email,
                name: result.name,
                company_id: result.company_id,
                role: result.role
            }
        }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
