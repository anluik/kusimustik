import { expect, test } from "@playwright/test";

import { OWNER_STATE, serviceDb } from "./support";

/**
 * Three owner-facing surfaces the second review found broken, none of which
 * any suite had ever opened.
 *
 * They share a file because they share the one expensive thing — a signed-in
 * owner — and because they are the same failure in three places: a state the
 * product can genuinely reach, rendering as nothing, as English boilerplate,
 * or as a blank page with a working button on it.
 */

test.use({ storageState: OWNER_STATE });

/**
 * Desktop only. Two of these assert on controls the app bar hides below `sm`,
 * and none of them is about a phone.
 */
test.skip(({ isMobile }) => isMobile === true, "an owner-desktop surface");

/** From supabase/seed.sql. */
const OWNER_ID = "00000000-0000-4000-8000-000000000001";

/** Surveys this file created, removed again however the test ended. */
const created: string[] = [];

test.afterEach(async () => {
    // The seed is a fixture `lib/db/seed.db.test.ts` asserts on, so a run of
    // this spec has to leave the owner with exactly the surveys it found.
    if (created.length === 0) return;
    await serviceDb().from("surveys").delete().in("id", created.splice(0));
});

test("a survey id that matches nothing is a page in the owner's own language", async ({
    page
}) => {
    // `notFound()` resolves to the nearest `not-found.tsx`, and until `(app)`
    // had one this answered a signed-in Estonian owner with Next.js's built-in
    // "404 · This page could not be found" inside a fully localized shell —
    // reachable from any bookmark to a deleted survey.
    await page.goto("/surveys/11111111-1111-4111-8111-111111111111/results");

    await expect(
        page.getByRole("heading", { name: "Lehte ei leitud" })
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
        "This page could not be found"
    );
    // The chrome stays: the way out is the list the sidebar already points at.
    await expect(
        page.getByRole("link", { name: "Tagasi küsitluste juurde" })
    ).toBeVisible();
});

test("publishing and the link are both reachable without leaving the builder", async ({
    page
}) => {
    await page.goto("/surveys");
    await page.getByRole("button", { name: "Uus küsitlus" }).click();
    await page.getByRole("textbox").first().fill("Avaldamise vool");
    await page.getByRole("button", { name: "Loo küsitlus" }).click();
    await page.waitForURL(/\/surveys\/[0-9a-f-]{36}$/);
    created.push(page.url().split("/").pop() ?? "");

    // Nothing to publish yet, so nothing offers to: the empty canvas already
    // says the first question comes next.
    await expect(page.getByRole("button", { name: /^Avalda/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Lisa küsimus" }).click();
    await page.getByRole("menuitem", { name: "Üks valik" }).click();

    // The count is the builder's own, so the control appears without a reload
    // — but it stays unavailable until autosave has put the question on the
    // server, because that is the document publishing acts on.
    const publish = page.getByRole("button", { name: /^Avalda/ });
    await expect(publish).toBeVisible();
    await expect(publish).toBeEnabled();

    await publish.click();
    // Scoped to the dialog on purpose: the bar's own button carries the same
    // word, so an unscoped match would click the trigger again and confirm
    // nothing.
    await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Avalda", exact: true })
        .click();

    // Published: the bar hands over the link instead of asking again.
    const link = page.getByRole("textbox", { name: /avalik link/i });
    await expect(link).toHaveValue("/k/avaldamise-vool", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Avalda/ })).toHaveCount(0);
});

test("a published survey with nothing to answer asks nobody anything", async ({
    page,
    browser
}) => {
    // Built directly rather than clicked into existence: publishing refuses an
    // empty survey, so the only way to reach this state is to remove the last
    // question afterwards — and what is under test is the state, not the route
    // to it.
    const survey = await serviceDb()
        .from("surveys")
        .insert({
            owner_id: OWNER_ID,
            title: "Tühjaks tehtud",
            status: "published",
            slug: "tuhjaks-tehtud",
            locale: "et",
            wave_group_id: "00000000-0000-4000-8000-0000000000ee",
            elements: [],
            published_at: new Date().toISOString()
        })
        .select("id")
        .single();
    expect(survey.error).toBeNull();
    const id = survey.data?.id ?? "";
    created.push(id);

    // One response from before the questions went, so the results page has
    // something to be wrong about.
    await serviceDb()
        .from("responses")
        .insert({ survey_id: id, survey_version: 1, locale: "et" });

    // The respondent gets told, not handed a blank form with a live button.
    const guest = await browser.newContext();
    const runner = await guest.newPage();
    await runner.goto("/k/tuhjaks-tehtud");
    await expect(
        runner.getByRole("heading", { name: "Küsitlus pole veel valmis" })
    ).toBeVisible();
    await expect(
        runner.getByRole("button", { name: "Saada vastused" })
    ).toHaveCount(0);
    await guest.close();

    // The owner's builder says the live link is collecting nothing, rather
    // than offering to copy it as though it worked.
    await page.goto(`/surveys/${id}`);
    await expect(
        page.getByText("küsimusteta — link ei kogu vastuseid")
    ).toBeVisible();
    await expect(
        page.getByRole("textbox", { name: /avalik link/i })
    ).toHaveCount(0);

    // And the summary says so rather than rendering an empty strip under a
    // card that claims a response.
    await page.goto(`/surveys/${id}/results`);
    await expect(page.getByText("Kokkuvõtteks pole midagi")).toBeVisible();
});
