import { expect, test } from "@playwright/test";

import {
    createFixtureSurvey,
    deleteFixtureSurvey,
    oneTextQuestion,
    readLikeARespondent,
    serviceDb
} from "./support";

/**
 * Phase 9's guards, from the side that matters: the respondent's.
 *
 * The honeypot, the timing floor and the rate limiter can only ever *refuse* a
 * submission, and the runner is the surface DESIGN §10 says must never be told
 * no without cause. So the first test here is the one that would fail if any
 * of them were tuned wrong, and it is the reason the thresholds in
 * `supabase/migrations/20260908130000_rate_limit.sql` are as generous as they
 * are.
 *
 * A fixture survey of this run's own rather than the seed: this spec submits,
 * counts and re-submits, and the seed is a shared fixture that two Playwright
 * projects and the db suite all assert on. Deleting the survey afterwards
 * takes its responses and its events with it.
 *
 * The timing floor's own threshold is `lib/runner/honeypot.test.ts`'s to pin
 * down; what is proved here is that it is wired in at all, which it shares
 * with the honeypot — one `looksAutomated` call decides both — and that a
 * respondent moving at a person's speed never meets either.
 */

type Fixture = { readonly id: string; readonly slug: string };

let fixture: Fixture | null = null;

test.beforeEach(async ({}, testInfo) => {
    // Unique per project *and* per test: the two projects run in parallel and
    // the slug is a unique index.
    const slug = `piirangud-${testInfo.project.name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const id = await createFixtureSurvey({
        title: "Piirangute test",
        slug,
        elements: oneTextQuestion()
    });
    fixture = { id, slug };
});

test.afterEach(async () => {
    if (fixture !== null) await deleteFixtureSurvey(fixture.id);
    fixture = null;
});

/** Narrows the module-level fixture for one test. */
function current(): Fixture {
    if (fixture === null) throw new Error("the fixture survey was not created");
    return fixture;
}

async function responseCount(surveyId: string): Promise<number> {
    const { count } = await serviceDb()
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("survey_id", surveyId);
    return count ?? 0;
}

test("an ordinary respondent is never blocked", async ({ page }) => {
    const survey = current();
    await page.goto(`/k/${survey.slug}`);

    await expect(
        page.getByRole("heading", { name: "Piirangute test" })
    ).toBeVisible();

    // The honeypot is in the document and out of everyone's way: not in the
    // accessibility tree, not in the tab order, and empty until something that
    // is not a respondent fills it.
    const honeypot = page.locator('input[name="kysimustik_hp"]');
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toHaveValue("");
    await expect(honeypot).toHaveAttribute("tabindex", "-1");

    const city = page.getByRole("textbox", { name: "Linn" });
    await expect(city).toBeVisible();
    await readLikeARespondent(page);
    await city.fill("Tartu");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "1"
    );

    await page.getByRole("button", { name: "Saada vastused" }).click();
    await expect(
        page.getByRole("heading", { name: "Aitäh vastamast!" })
    ).toBeVisible();

    expect(await responseCount(survey.id)).toBe(1);
});

test("a filled honeypot is refused, and the retry gets through", async ({
    page
}) => {
    const survey = current();
    await page.goto(`/k/${survey.slug}`);
    await readLikeARespondent(page);
    await page.getByRole("textbox", { name: "Linn" }).fill("Narva");

    // What a form-filler does and a respondent cannot: the field is off-screen
    // and aria-hidden, so nothing reading the page as a person would ever
    // reach it.
    await page.locator('input[name="kysimustik_hp"]').fill("http://spam.test");

    await page.getByRole("button", { name: "Saada vastused" }).click();
    // `.first()`: Next's own route announcer is an alert too.
    await expect(page.getByRole("alert").first()).toContainText(
        "Vastust ei võetud vastu"
    );
    expect(await responseCount(survey.id)).toBe(0);

    // The runner clears the honeypot when it sees the refusal, so the one
    // person who can trip this by accident — someone whose password manager
    // filled a hidden field — is one tap from getting through.
    await page.getByRole("button", { name: "Proovi uuesti" }).click();
    await expect(
        page.getByRole("heading", { name: "Aitäh vastamast!" })
    ).toBeVisible();
    expect(await responseCount(survey.id)).toBe(1);
});
