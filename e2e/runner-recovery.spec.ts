import { expect, test, type Page } from "@playwright/test";

import {
    SEED_SLUG,
    SEED_SURVEY_ID,
    createFixtureSurvey,
    deleteFixtureSurvey,
    oneTextQuestion,
    serviceDb
} from "./support";

/**
 * What the runner does when the ordinary path does not finish cleanly: the
 * respondent comes back to a link they have already answered, and the survey
 * stops collecting while they are typing.
 *
 * Neither was covered, and both were wrong in the same direction — the runner
 * threw work away. A reload after a submit returned a blank form and took a
 * second response with it; a survey closing mid-answer replaced the whole page
 * with a notice, discarding everything the respondent had written at the one
 * moment they might have wanted to keep it.
 */

/** The city this run typed, which is how `afterEach` finds its own row. */
let marker: string | null = null;

test.afterEach(async () => {
    // `lib/db/seed.db.test.ts` asserts on the seed's exact distributions, so
    // this spec puts back what it added — the contract `runner.spec.ts` keeps.
    if (marker === null) return;
    const db = serviceDb();
    const { data } = await db
        .from("answers")
        .select("response_id")
        .eq("survey_id", SEED_SURVEY_ID)
        .eq("value->>value", marker);
    const ids = (data ?? []).map(row => row.response_id as string);
    if (ids.length > 0) await db.from("responses").delete().in("id", ids);
    marker = null;
});

/** Fills every required question, leaving the optional city as the marker. */
async function answerEverything(page: Page, city: string): Promise<void> {
    for (const group of await page.locator("[role=radiogroup]").all()) {
        await group.getByRole("radio").first().check();
    }
    for (const group of await page.locator("[role=group]").all()) {
        const boxes = await group.getByRole("checkbox").all();
        if (boxes[0] !== undefined) await boxes[0].check();
    }
    for (const select of await page.locator("select").all()) {
        await select.selectOption({ index: 1 });
    }
    await page.getByRole("textbox").first().fill(city);
}

test("coming back to a link already answered does not quietly answer it twice", async ({
    page
}) => {
    marker = `Tagasitulek ${Date.now()}`;
    await page.goto(`/k/${SEED_SLUG}`);
    await answerEverything(page, marker);
    await page.getByRole("button", { name: "Saada vastused" }).click();
    await expect(
        page.getByRole("heading", { name: "Aitäh vastamast!" })
    ).toBeVisible();

    // The habitual refresh. `sessionStorage` remembers within the visit.
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Aitäh vastamast!" })
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Saada vastused" })
    ).toHaveCount(0);

    // But a shared phone in a lobby is exactly where this link is opened
    // twice on purpose, so there is a way through.
    await page.getByRole("button", { name: "Vasta uuesti" }).click();
    await expect(
        page.getByRole("button", { name: "Saada vastused" })
    ).toBeVisible();

    const { count } = await serviceDb()
        .from("answers")
        .select("response_id", { count: "exact", head: true })
        .eq("survey_id", SEED_SURVEY_ID)
        .eq("value->>value", marker);
    expect(count).toBe(1);
});

test("a survey closing mid-answer keeps the answers on screen", async ({
    page
}, testInfo) => {
    // Its own survey, not the seed: this test closes what it is answering, and
    // the other project answering the same survey at that moment would find it
    // shut. A slug per project keeps the two runs apart.
    const slug = `sulgub-${testInfo.project.name}`;
    const id = await createFixtureSurvey({
        title: "Sulgub vastamise ajal",
        slug,
        elements: oneTextQuestion()
    });

    try {
        await page.goto(`/k/${slug}`);
        const typed = `Suletud ${Date.now()}`;
        await page.getByRole("textbox").first().fill(typed);

        // Closed under the respondent, from outside their browser entirely.
        await serviceDb()
            .from("surveys")
            .update({ status: "closed" })
            .eq("id", id);

        await page.getByRole("button", { name: "Saada vastused" }).click();

        // The inline alert, not a page that replaces everything they wrote.
        await expect(
            page.getByText(
                "Küsitlus suleti vastamise ajal ega kogu enam vastuseid."
            )
        ).toBeVisible();
        await expect(page.getByRole("textbox").first()).toHaveValue(typed);
        // Retrying cannot work, so the action goes quiet rather than lying.
        await expect(
            page.getByRole("button", { name: "Saada vastused" })
        ).toBeDisabled();
    } finally {
        await deleteFixtureSurvey(id);
    }
});
