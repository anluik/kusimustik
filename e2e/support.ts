import { createClient } from "@supabase/supabase-js";

/**
 * What the e2e specs share: a client that can see what an anonymous
 * respondent's visit stored, and the teardown that puts the seed back.
 *
 * The seed is a fixture two suites read. `lib/db/*.db.test.ts` asserts on its
 * exact distributions — including that wave one has *no* interaction events,
 * because a survey collected before the instrumentation existed is a real
 * state and its empty funnel has to be reachable (DECISIONS 018). Every visit
 * these specs make emits some, so every spec that opens the seeded runner has
 * to clear them again, or `pnpm test:e2e` quietly breaks `pnpm test:db`.
 */

/** From supabase/seed.sql, wave one. Stable across `pnpm db:reset`. */
export const SEED_SLUG = "rahulolu-2025";
export const SEED_SURVEY_ID = "00000000-0000-4000-8000-0000000000a1";

/**
 * Bypasses RLS deliberately: the point is to check what an anonymous
 * submission stored, which no anonymous client is allowed to read back.
 */
export function serviceDb() {
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const key = process.env["SUPABASE_SECRET_KEY"];
    if (url === undefined || key === undefined) {
        throw new Error(
            "e2e needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY; see .env.example"
        );
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Deletes every interaction event against the seeded wave one. Safe to run
 * while the other Playwright project is still going: the seed puts none there
 * in the first place, so anything present is this run's own noise.
 */
export async function clearSeededEvents(): Promise<void> {
    await serviceDb()
        .from("survey_events")
        .delete()
        .eq("survey_id", SEED_SURVEY_ID);
}
