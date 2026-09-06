import { z } from "zod";

/**
 * Read lazily rather than at module load: importing a repository module must
 * not throw in an environment that has no Supabase configured (a unit test, a
 * lint run). The clients themselves arrive in Phase 3.
 */

const UrlSchema = z.url();
const KeySchema = z.string().min(1);

function required(name: string, value: string | undefined): string {
    if (value === undefined || value === "") {
        throw new Error(`Missing environment variable ${name}`);
    }
    return value;
}

export function supabaseUrl(): string {
    return UrlSchema.parse(
        required(
            "NEXT_PUBLIC_SUPABASE_URL",
            process.env.NEXT_PUBLIC_SUPABASE_URL
        )
    );
}

/** Safe to ship to the browser: RLS is what protects the data. */
export function supabasePublishableKey(): string {
    return KeySchema.parse(
        required(
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        )
    );
}

/** Bypasses RLS. Server-side only, and never in a request path. */
export function supabaseSecretKey(): string {
    return KeySchema.parse(
        required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY)
    );
}
