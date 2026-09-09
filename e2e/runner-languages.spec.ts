import { expect, test } from "@playwright/test";

import {
    createFixtureSurvey,
    deleteFixtureSurvey,
    readLikeARespondent,
    serviceDb
} from "./support";

/**
 * Phase 12 step 3 from the only side that counts: a respondent opens a link
 * they were sent, finds their own language on it, and answers in it.
 *
 * A fixture survey of this run's own — the seed is Estonian and translated
 * into nothing, which is deliberately what every survey looked like after the
 * migration (docs/DECISIONS.md 030), and two Playwright projects assert on it
 * in parallel.
 *
 * The document below is the state that matters: one question translated, one
 * not. A half-finished translation is normal, and what a respondent reading
 * Russian must never meet is a blank card where the Estonian question was.
 */

/** Fresh ids every call: a question id is unique across the whole table, so
    two fixture surveys can never share one. */
function bilingualQuestions(): readonly unknown[] {
    return [
        {
            id: crypto.randomUUID(),
            key: "city",
            type: "short_text",
            title: { et: "Linn", ru: "Город" },
            required: false,
            maxLength: 100,
            isAnswerable: true
        },
        {
            id: crypto.randomUUID(),
            key: "street",
            type: "short_text",
            // No Russian: it falls back to the survey's own language.
            title: { et: "Tänav" },
            required: false,
            maxLength: 100,
            isAnswerable: true
        }
    ];
}

type Fixture = { readonly id: string; readonly slug: string };

let fixture: Fixture | null = null;

test.beforeEach(async ({}, testInfo) => {
    const slug = `keeled-${testInfo.project.name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const id = await createFixtureSurvey({
        title: "Keelte test",
        slug,
        locale: "et",
        locales: ["et", "ru"],
        elements: bilingualQuestions()
    });
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

test("a respondent picks their language and answers in it", async ({
    page
}) => {
    const survey = current();

    // The share link carries no language: it is the survey's own.
    await page.goto(`/k/${survey.slug}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page.getByText("Linn")).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Saada vastused" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Русский" }).click();
    await page.waitForURL(`**/k/${survey.slug}/ru`);

    // The questions, the chrome and the document's language, all of it.
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByText("Город")).toBeVisible();
    // The untranslated question falls back rather than blanking.
    await expect(page.getByText("Tänav")).toBeVisible();

    await readLikeARespondent(page);
    await page.getByRole("textbox", { name: "Город" }).fill("Нарва");
    await page.getByRole("button", { name: "Отправить ответы" }).click();
    await expect(
        page.getByRole("heading", { name: "Спасибо за ответы!" })
    ).toBeVisible();

    // The response records the language it was answered in, not the one the
    // survey was written in.
    const { data } = await serviceDb()
        .from("responses")
        .select("locale")
        .eq("survey_id", survey.id);
    expect(data?.map(row => row.locale)).toEqual(["ru"]);
});

test("switching back lands on the share link, not a second spelling of it", async ({
    page
}) => {
    const survey = current();

    await page.goto(`/k/${survey.slug}/ru`);
    await page.getByRole("link", { name: "Eesti keel" }).click();
    await page.waitForURL(`**/k/${survey.slug}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
});

test("a language the survey is not offered in sends the respondent to the survey", async ({
    page
}) => {
    const survey = current();

    // A link from before the author dropped English, or one typed by hand.
    // The respondent came here to answer, so they get the survey rather than
    // a refusal.
    await page.goto(`/k/${survey.slug}/en`);
    await page.waitForURL(`**/k/${survey.slug}`);
    await expect(page.getByText("Linn")).toBeVisible();
});

test("a segment that names no language at all is not a page", async ({
    page
}) => {
    const survey = current();

    const response = await page.goto(`/k/${survey.slug}/klingon`);
    expect(response?.status()).toBe(404);
    await expect(
        page.getByRole("heading", { name: "Küsitlust ei leitud" })
    ).toBeVisible();
});

test("a survey offered in one language has no picker", async ({
    page
}, testInfo) => {
    // The common case, and a picker with one entry is a choice nobody has.
    await page.goto(`/k/${current().slug}`);
    await expect(page.getByRole("link", { name: "Русский" })).toBeVisible();

    const single = `keeled-yks-${testInfo.project.name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const id = await createFixtureSurvey({
        title: "Ühekeelne",
        slug: single,
        elements: bilingualQuestions()
    });
    try {
        await page.goto(`/k/${single}`);
        await expect(page.getByText("Linn")).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Eesti keel" })
        ).toHaveCount(0);
    } finally {
        await deleteFixtureSurvey(id);
    }
});
