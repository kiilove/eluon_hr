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

// Basic PBKDF2 implementation using Web Crypto API
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

    // Export as hex string (simplified for demo, usually we store base64 or raw bytes)
    const exported = await crypto.subtle.exportKey("raw", key);
    return Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { email, password, name, companyId: manualCompanyId } = await context.request.json() as any;

        if (!email || !password) {
            return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400 });
        }

        // 1. Check if user exists
        const existing = await context.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existing) {
            return new Response(JSON.stringify({ error: "User already exists" }), { status: 409 });
        }

        // 2. Validate Company
        let companyId = manualCompanyId;
        if (companyId !== 'comp_eluon' && companyId !== 'comp_eluonins') {
            // Fallback just in case, or error out. Prioritizing manual selection as per request.
            return new Response(JSON.stringify({ error: "Invalid company selection" }), { status: 400 });
        }

        // 3. Crypto Goodness
        const salt = crypto.randomUUID(); // Simple unique salt
        const passwordHash = await hashPassword(password, salt);
        const userId = crypto.randomUUID();

        // 4. Transaction (Ideally batch or interactive, but D1 supports batch)
        // We need to insert into TWO tables.
        await context.env.DB.batch([
            // Insert Profile
            context.env.DB.prepare(
                "INSERT INTO users (id, email, company_id, name) VALUES (?, ?, ?, ?)"
            ).bind(userId, email, companyId, name || email.split('@')[0]),

            // Insert Credentials
            context.env.DB.prepare(
                "INSERT INTO user_credentials (user_id, password_hash, salt) VALUES (?, ?, ?)"
            ).bind(userId, passwordHash, salt)
        ]);

        return new Response(JSON.stringify({ success: true, user: { id: userId, email, companyId, name } }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
