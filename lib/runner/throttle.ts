import type { RateLimitBucket } from "@/lib/db/rate-limit";
import { consumeRateLimit } from "@/lib/db/rate-limit";
import type { Db } from "@/lib/db/types";

/**
 * The runner's side of the Postgres rate limiter (docs/DECISIONS.md 026).
 *
 * Two jobs: work out what to key on, and decide what happens when the limiter
 * itself cannot answer.
 */

/** Longer than any address; the database refuses more than 100 characters. */
const MAX_CLIENT_LENGTH = 64;

/**
 * The address to count against, as the platform reports it.
 *
 * `x-forwarded-for` is attacker-controlled in general — it is only as good as
 * the proxy in front of the app, and Vercel rewrites it, which is why the
 * leftmost entry is the one taken. Deployed without such a proxy the worst a
 * forged header buys is a fresh bucket, never a write that RLS would have
 * refused; it is a throttle, not an authorisation check.
 *
 * Locally there is no proxy and no header at all, so every request shares one
 * bucket. That is fine — the thresholds are far above what a development
 * machine or the e2e suite produces — and it is why this returns a constant
 * rather than throwing.
 */
export function clientIdentifier(headers: {
    get(name: string): string | null;
}): string {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const candidate =
        forwarded !== undefined && forwarded !== ""
            ? forwarded
            : (headers.get("x-real-ip")?.trim() ?? "");

    return candidate === "" ? "unknown" : candidate.slice(0, MAX_CLIENT_LENGTH);
}

/**
 * Whether this write may go ahead.
 *
 * **Fails open.** A limiter that is unreachable must not be able to close a
 * survey: the cost of letting a request through is one uncounted write against
 * policies that are still enforced, and the cost of refusing is a respondent
 * told no for a reason that has nothing to do with them. DESIGN §10 makes that
 * an easy trade.
 */
export async function allowsWrite(
    db: Db,
    key: {
        readonly bucket: RateLimitBucket;
        readonly scope: string;
        readonly client: string;
    }
): Promise<boolean> {
    try {
        return await consumeRateLimit(db, key);
    } catch (error) {
        console.error("rate limiter unavailable; allowing the write", error);
        return true;
    }
}
