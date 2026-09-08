import { unwrap } from "@/lib/db/errors";
import type { Db } from "@/lib/db/types";

/**
 * The Postgres rate limiter (docs/PLAN.md Phase 9, docs/DECISIONS.md 026).
 *
 * The counter, the salt and the thresholds all live in the database — see
 * `supabase/migrations/20260908130000_rate_limit.sql`. The function is granted
 * to `anon`, so the limits deliberately are *not* arguments: a caller-supplied
 * threshold would be a limiter anyone could switch off.
 *
 * The values below are a copy of what the migration says, kept here so calling
 * code and its tests can talk about the threshold without reading SQL.
 * `rate-limit.db.test.ts` fails if the two ever drift apart.
 */
export const RATE_LIMITS = {
    /** One respondent's submissions to one survey. */
    submit: { limit: 30, windowSeconds: 300 },
    /** One visit's analytics beacons for one survey. */
    events: { limit: 120, windowSeconds: 60 }
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export type RateLimitKey = {
    readonly bucket: RateLimitBucket;
    /** Which survey. Counting globally would let one busy survey close another. */
    readonly scope: string;
    /**
     * The caller's address as the server sees it. It is hashed inside the
     * database under a rotating salt and never stored in the clear; nothing
     * here — and nothing on `responses` — may hold a raw IP.
     */
    readonly client: string;
};

/**
 * Counts one request against its bucket and reports whether it is allowed.
 *
 * Throws like any other repository function if the database refuses. Callers
 * on the runner's write paths catch that and let the request through: a
 * limiter that is down must not be able to close the survey, and the RLS
 * policies are still the thing that decides whether the write lands.
 */
export async function consumeRateLimit(
    db: Db,
    key: RateLimitKey
): Promise<boolean> {
    return unwrap(
        `consumeRateLimit(${key.bucket}, ${key.scope})`,
        await db.rpc("consume_rate_limit", {
            p_bucket: key.bucket,
            p_scope: key.scope,
            p_client: key.client
        })
    );
}
