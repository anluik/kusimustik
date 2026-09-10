import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { MIN_SUBMIT_MS } from "@/lib/runner/honeypot";

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

/**
 * Where `globalSetup` leaves the owner's signed-in cookies.
 *
 * The owner app had no end-to-end coverage at all, which is how a live count
 * that never updated survived a green suite: nothing ever opened the results
 * page as the person it is built for. Signing in once and reusing the state
 * keeps that cheap, and keeps Supabase's per-address magic-link rate limit out
 * of the test run.
 */
export const OWNER_STATE = "e2e/.auth/owner.json";
export const OWNER_EMAIL = "owner@kusimustik.test";

/** Mailpit, from `supabase status`. The local stack's inbox. */
const MAILPIT = "http://127.0.0.1:54324";

/**
 * The most recent message's id, so a later poll can tell a new mail from the
 * one already sitting there.
 */
async function latestMessageId(): Promise<string> {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=1`);
    const body = (await res.json()) as { messages: { ID: string }[] };
    return body.messages[0]?.ID ?? "";
}

/**
 * Signs in through the real magic link rather than a forged cookie.
 *
 * The link is PKCE: the verifier is a cookie the sign-in page set, so the link
 * only works in the browser that asked for it and in a context that kept that
 * cookie. Reading it out of Mailpit and opening it in the same page is the
 * only faithful way to arrive signed in — and it exercises the callback route
 * on the way, which is a flow nothing else covers.
 */
export async function signInAsOwner(page: Page): Promise<void> {
    const before = await latestMessageId();

    await page.goto("/login");
    await page.getByLabel(/E-posti aadress/i).fill(OWNER_EMAIL);
    await page.getByRole("button", { name: /Saada sisselogimislink/i }).click();

    let link: string | null = null;
    for (let attempt = 0; attempt < 40 && link === null; attempt++) {
        await page.waitForTimeout(400);
        const id = await latestMessageId();
        if (id === "" || id === before) continue;

        const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
        const mail = (await res.json()) as { HTML: string };
        const href = /href="([^"]+)"/.exec(mail.HTML)?.[1];
        if (href !== undefined) link = href.replaceAll("&amp;", "&");
    }
    if (link === null) throw new Error("no sign-in link arrived in Mailpit");

    await page.goto(link);
    await page.waitForURL(/\/surveys/, { timeout: 20_000 });
}

/** The seeded owner, from supabase/seed.sql. */
export const OWNER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * A published survey of this run's own, deleted again when the spec is done.
 *
 * The seed is a shared, asserted fixture: two Playwright projects run in
 * parallel over it and `lib/db/*.db.test.ts` pins its distributions. A spec
 * that needs to *change* a survey — close it, count its responses exactly —
 * cannot do that to the seed without racing the other project, which is how a
 * green suite started failing intermittently the moment two specs did.
 *
 * `slug` has to be unique per project, so pass the project name in.
 */
export async function createFixtureSurvey(fixture: {
    readonly title: string;
    readonly slug: string;
    readonly elements: readonly unknown[];
    /** The language it is written in; Estonian unless a spec says otherwise. */
    readonly locale?: string;
    /**
     * The languages it is *offered* in. Omitted, the trigger fills in
     * `[locale]` — a survey is offered in the language it is written in until
     * its author says otherwise (docs/DECISIONS.md 031).
     */
    readonly locales?: readonly string[];
}): Promise<string> {
    const { data, error } = await serviceDb()
        .from("surveys")
        .insert({
            owner_id: OWNER_ID,
            // Locale-keyed, like everything else a respondent reads. The
            // fixtures stay one-language: a spec reads better saying what the
            // survey is called than saying it in a map (docs/DECISIONS.md 034).
            title: { [fixture.locale ?? "et"]: fixture.title },
            slug: fixture.slug,
            status: "published",
            locale: fixture.locale ?? "et",
            ...(fixture.locales !== undefined && {
                locales: [...fixture.locales]
            }),
            wave_group_id: crypto.randomUUID(),
            elements: fixture.elements,
            published_at: new Date().toISOString()
        })
        .select("id")
        .single();

    if (error !== null) throw new Error(`fixture survey: ${error.message}`);
    return data.id as string;
}

export async function deleteFixtureSurvey(id: string): Promise<void> {
    await serviceDb().from("surveys").delete().eq("id", id);
}

/** One optional written question, which is enough to render a form. */
export function oneTextQuestion(): readonly unknown[] {
    return [
        {
            id: crypto.randomUUID(),
            key: "city",
            type: "short_text",
            // Locale-keyed, like everything else in a stored document; the
            // fixture surveys below are Estonian (DECISIONS 030).
            title: { et: "Linn" },
            required: false,
            maxLength: 100,
            isAnswerable: true
        }
    ];
}

/**
 * The pause a respondent takes before they can have answered anything.
 *
 * Phase 9 put a submission-timing floor in front of the runner: a submission
 * that follows the form appearing by less than `MIN_SUBMIT_MS` is refused
 * server-side as automated. Playwright fills a survey in about a second, which
 * is under that and is precisely the behaviour the floor exists to catch — an
 * automated browser answering that fast *is* the thing being refused. Every
 * spec that submits waits it out once, so what these tests measure stays the
 * runner rather than how quickly the machine running them types.
 */
export async function readLikeARespondent(page: Page): Promise<void> {
    await page.waitForTimeout(MIN_SUBMIT_MS);
}
