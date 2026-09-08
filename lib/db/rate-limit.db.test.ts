import { describe, expect, it } from "vitest";

import { RATE_LIMITS, consumeRateLimit } from "@/lib/db/rate-limit";
import { anonClient, serviceClient } from "@/lib/db/test-support";

/**
 * The Postgres rate limiter (docs/PLAN.md Phase 9, docs/DECISIONS.md 026).
 *
 * Everything worth proving here is the database's: that the threshold is where
 * `RATE_LIMITS` says it is, that a bucket is per survey and per caller so one
 * busy survey cannot close another, and that the anonymous client which
 * *triggers* the hashing can reach neither the counters nor the salt.
 *
 * Every call uses a client identifier unique to its test. The table is shared
 * and the windows are minutes long, so a fixed one would make two runs of this
 * file — or two tests in it — count against each other.
 */

const caller = (label: string): string =>
    `${label}-${crypto.randomUUID().slice(0, 8)}`;

/** Counts one request and returns whether it was allowed. */
async function hit(
    bucket: keyof typeof RATE_LIMITS,
    scope: string,
    client: string
): Promise<boolean> {
    return consumeRateLimit(anonClient(), { bucket, scope, client });
}

describe.each(["submit", "events"] as const)("the %s bucket", bucket => {
    const { limit } = RATE_LIMITS[bucket];

    it("allows exactly the threshold and refuses the next one", async () => {
        // The threshold lives in the migration and is restated in
        // `lib/db/rate-limit.ts` so callers can talk about it. This is what
        // stops the two drifting apart.
        const client = caller(bucket);
        const verdicts: boolean[] = [];
        for (let i = 0; i < limit + 1; i += 1) {
            verdicts.push(await hit(bucket, "survey-a", client));
        }

        expect(verdicts.slice(0, limit)).toEqual(Array(limit).fill(true));
        expect(verdicts.at(-1)).toBe(false);
    });
});

describe("what a bucket is scoped to", () => {
    it("leaves a different survey untouched", async () => {
        // One survey being hammered must not stop another from collecting.
        const client = caller("scope");
        for (let i = 0; i < RATE_LIMITS.submit.limit + 1; i += 1) {
            await hit("submit", "survey-a", client);
        }

        expect(await hit("submit", "survey-a", client)).toBe(false);
        expect(await hit("submit", "survey-b", client)).toBe(true);
    });

    it("leaves a different caller untouched", async () => {
        const exhausted = caller("busy");
        for (let i = 0; i < RATE_LIMITS.submit.limit + 1; i += 1) {
            await hit("submit", "survey-c", exhausted);
        }

        expect(await hit("submit", "survey-c", exhausted)).toBe(false);
        expect(await hit("submit", "survey-c", caller("fresh"))).toBe(true);
    });

    it("leaves a different bucket untouched", async () => {
        // The bucket is part of the hashed key, so the same address answering
        // and sending beacons is two counters, not one.
        const client = caller("bucket");
        for (let i = 0; i < RATE_LIMITS.submit.limit + 1; i += 1) {
            await hit("submit", "survey-d", client);
        }

        expect(await hit("submit", "survey-d", client)).toBe(false);
        expect(await hit("events", "survey-d", client)).toBe(true);
    });
});

describe("what the function refuses to be", () => {
    it("has no bucket a caller can invent", async () => {
        // The thresholds are in the database precisely because this function is
        // granted to `anon`; an unknown bucket must be an error rather than a
        // default that lets everything through.
        const { error } = await anonClient().rpc("consume_rate_limit", {
            p_bucket: "generous",
            p_scope: "survey-a",
            p_client: caller("invented")
        });
        expect(error?.message).toContain("unknown rate limit bucket");
    });

    it("refuses an empty caller", async () => {
        const { error } = await anonClient().rpc("consume_rate_limit", {
            p_bucket: "submit",
            p_scope: "survey-a",
            p_client: ""
        });
        expect(error).not.toBeNull();
    });

    it("does not let an anonymous caller run the sweep", async () => {
        // Supabase's default privileges grant EXECUTE on every new function to
        // anon, so the migration revokes this one by name. The sweep only
        // deletes rows nothing can read any more, but making the database do
        // deletes on request is not something an anonymous caller needs.
        const { error } = await anonClient().rpc("prune_rate_limits");
        expect(error?.message).toMatch(
            /permission denied|not find|schema cache/i
        );
    });
});

describe("what the limiter stores", () => {
    it("is unreadable by the anonymous client that fills it", async () => {
        // RLS is enabled with no policy and no grant, so neither the counters
        // nor the salt is reachable from the runner's own client. Without that
        // the salt would be public and the hash pointless.
        const client = anonClient();
        for (const table of ["rate_limit_hits", "rate_limit_salts"] as const) {
            const { data, error } = await client.from(table).select("*");
            expect({ table, rows: data ?? [] }).toEqual({ table, rows: [] });
            if (error !== null) expect(error.message).toBeTruthy();
        }
    });

    it("holds no trace of the address it counted", async () => {
        // DECISIONS 004 kept behaviour unjoinable to answers; a raw IP beside
        // `responses` would be exactly that join. The stored key is a digest,
        // and nothing else about the caller survives.
        const client = caller("192.0.2.55");
        await hit("submit", "survey-privacy", client);

        const { data } = await serviceClient()
            .from("rate_limit_hits")
            .select("*");
        const dumped = JSON.stringify(data ?? []);

        expect(dumped).not.toContain(client);
        expect(dumped).not.toContain("survey-privacy");
        expect(dumped).not.toContain("submit");
    });

    it("prunes windows that can no longer be read", async () => {
        const db = serviceClient();
        const stale = new Date(Date.now() - 7_200_000).toISOString();
        const inserted = await db.from("rate_limit_hits").insert({
            subject: "\\xdeadbeef",
            window_start: stale,
            hits: 1
        });
        expect(inserted.error).toBeNull();

        const pruned = await db.rpc("prune_rate_limits");
        expect(pruned.error).toBeNull();

        const { data } = await db
            .from("rate_limit_hits")
            .select("subject")
            .lt("window_start", new Date(Date.now() - 3_600_000).toISOString());
        expect(data).toEqual([]);
    });
});
