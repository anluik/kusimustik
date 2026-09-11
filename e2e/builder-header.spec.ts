import { expect, test } from "@playwright/test";

import {
    OWNER_STATE,
    createFixtureSurvey,
    deleteFixtureSurvey,
    serviceDb
} from "./support";

/**
 * The survey header block, end to end (docs/DECISIONS.md 034).
 *
 * The survey's title and the paragraph above the first question used to be a
 * modal settings dialog. They are content — a respondent reads both, before
 * anything else — so they are the first row of the element list now, edited in
 * the same panel as a question, translated the same way and saved with the
 * rest of the document.
 *
 * This walks the whole of that: type Estonian into the header block, switch
 * the app bar's language switcher to Russian, see the Estonian arrive as a
 * *placeholder* rather than as text, type Russian, and then open the public
 * link in both languages. The last two assertions are the bug this was built
 * for — a Russian respondent reading an Estonian header on every screen.
 */

test.use({ storageState: OWNER_STATE });

/** Desktop only: the three-panel builder is not a phone surface. */
test.skip(({ isMobile }) => isMobile === true, "a builder surface");

type Fixture = { readonly id: string; readonly slug: string };

let fixture: Fixture | null = null;

test.beforeEach(async ({}, testInfo) => {
    const slug = `paise-${testInfo.project.name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const id = await createFixtureSurvey({
        title: "Päise test",
        slug,
        elements: [
            {
                id: crypto.randomUUID(),
                key: "city",
                type: "short_text",
                title: { et: "Linn", ru: "Город" },
                required: false,
                maxLength: 100,
                isAnswerable: true
            }
        ]
    });
    // Offered in Russian as well, which is what makes the switcher appear.
    await serviceDb()
        .from("surveys")
        .update({ locales: ["et", "ru"] })
        .eq("id", id);
    fixture = { id, slug };
});

test.afterEach(async () => {
    if (fixture !== null) await deleteFixtureSurvey(fixture.id);
    fixture = null;
});

function current(): Fixture {
    if (fixture === null) throw new Error("the fixture survey was not created");
    return fixture;
}

test("the header block is translated like a question, and the runner follows", async ({
    page
}) => {
    const survey = current();
    await page.goto(`/surveys/${survey.id}`);

    // It is the first row of the element list, above question 1, and it is
    // what the builder opens on.
    const title = page.getByRole("textbox", { name: "Pealkiri" });
    const intro = page.getByRole("textbox", { name: "Tutvustus" });
    await expect(title).toHaveValue("Päise test");

    await title.fill("Maine ja rahulolu 2026");
    await intro.fill("Vastamine võtab umbes kolm minutit.");

    // The app bar reads the header block, so it answers a rename immediately.
    await expect(
        page.locator("header").getByText("Maine ja rahulolu 2026")
    ).toBeVisible();
    await expect(page.getByText("Salvestatud")).toBeVisible({
        timeout: 15_000
    });

    // Switch the language the panel is editing. Named by its tablist: the
    // sidebar's app-language switcher is a tab strip with the same options.
    await page
        .getByRole("tablist", { name: "Küsitluse keel, mida muudad" })
        .getByRole("tab", { name: /vene keel/i })
        .click();

    // Untranslated: the field is empty and the Estonian shows through as the
    // placeholder. Typing over a *value* would have filed the Estonian as its
    // own Russian translation, which is the failure DECISIONS 031 designed
    // this projection to prevent.
    await expect(title).toHaveValue("");
    await expect(title).toHaveAttribute(
        "placeholder",
        "Maine ja rahulolu 2026"
    );
    await expect(intro).toHaveValue("");

    await title.fill("Репутация и удовлетворённость 2026");
    await expect(page.getByText("Salvestatud")).toBeVisible({
        timeout: 15_000
    });

    // The public link, in both languages. The intro was never translated, so
    // it falls back rather than leaving a blank at the top of the page.
    await page.goto(`/k/${survey.slug}`);
    await expect(
        page.getByRole("heading", { name: "Maine ja rahulolu 2026" })
    ).toBeVisible();

    await page.goto(`/k/${survey.slug}/ru`);
    await expect(
        page.getByRole("heading", {
            name: "Репутация и удовлетворённость 2026"
        })
    ).toBeVisible();
    await expect(
        page.getByText("Vastamine võtab umbes kolm minutit.")
    ).toBeVisible();
});

test("the owner's list keeps showing the survey's own language", async ({
    page
}) => {
    // The translation is for the respondent. The survey's name in the owner's
    // index does not move when they switch the app's language.
    const survey = current();
    await page.goto(`/surveys/${survey.id}`);

    await page
        .getByRole("textbox", { name: "Pealkiri" })
        .fill("Ainult eesti keeles");
    await expect(page.getByText("Salvestatud")).toBeVisible({
        timeout: 15_000
    });

    await page.goto("/surveys");
    await expect(page.getByText("Ainult eesti keeles")).toBeVisible();
});
