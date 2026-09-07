import { expect, test } from "@playwright/test";

import { SEED_SLUG, SEED_SURVEY_ID, serviceDb } from "./support";

/**
 * The one end-to-end test docs/PLAN.md Phase 6 asks for: open the seeded
 * survey, answer every question type, submit, and assert the row lands in the
 * database. It runs on a desktop viewport and on a phone, because the runner
 * is the priority surface (docs/DESIGN.md §10).
 *
 * The database assertions go through the secret key deliberately — the point
 * is to check what an anonymous respondent's submission *stored*, which no
 * anonymous client is allowed to read back.
 */

const SLUG = SEED_SLUG;

/** From supabase/seed.sql, wave one. Stable across `pnpm db:reset`. */
const Q = {
    intro: "10000000-0000-4000-8000-000000000001",
    role: "10000000-0000-4000-8000-000000000002",
    channels: "10000000-0000-4000-8000-000000000003",
    country: "10000000-0000-4000-8000-000000000004",
    city: "10000000-0000-4000-8000-000000000005",
    feedback: "10000000-0000-4000-8000-000000000006",
    satisfaction: "10000000-0000-4000-8000-000000000007",
    recommend: "10000000-0000-4000-8000-000000000008",
    teamRatings: "10000000-0000-4000-8000-000000000009"
} as const;

const SURVEY_ID = SEED_SURVEY_ID;

/**
 * The city this run answered with. Unique per test, because the two projects
 * answer the same seeded survey at the same time — and because it is how the
 * cleanup below finds the response again.
 */
let marker: string | null = null;

test.afterEach(async () => {
    // The seed is two waves of 30 responses with distributions
    // `lib/db/seed.db.test.ts` asserts on, so a run of this spec must leave it
    // exactly as it found it. The interaction events this visit emitted are
    // cleared by the global teardown instead: they are asserted on below, and
    // the other project is still running.
    if (marker === null) return;
    const db = serviceDb();
    const { data } = await db
        .from("answers")
        .select("response_id")
        .eq("survey_id", SURVEY_ID)
        .eq("question_id", Q.city)
        .eq("value->>value", marker);
    const ids = (data ?? []).map(row => row.response_id as string);
    if (ids.length > 0) await db.from("responses").delete().in("id", ids);
    marker = null;
});

test.describe("the public runner", () => {
    test("answers every question type and stores the response", async ({
        page
    }, testInfo) => {
        const city = `Tartu ${testInfo.project.name} ${crypto.randomUUID().slice(0, 8)}`;
        marker = city;
        const startedAt = new Date().toISOString();

        await page.goto(`/k/${SLUG}`);

        await expect(
            page.getByRole("heading", { name: "Teenuse rahulolu-uuring" })
        ).toBeVisible();
        // The statement block is shown, not asked.
        await expect(
            page.getByRole("heading", { name: "Aitäh, et osalete" })
        ).toBeVisible();

        // Submitting an empty form must not reach the server.
        await page.getByRole("button", { name: "Saada vastused" }).click();
        await expect(page.getByRole("alert").first()).toContainText(
            "küsimust vajavad veel vastust"
        );

        const card = (id: string) => page.locator(`#q-${id}`);

        await card(Q.role).getByRole("radio", { name: "Õppejõud" }).check();

        await card(Q.channels)
            .getByRole("checkbox", { name: "E-kiri" })
            .check();
        await card(Q.channels)
            .getByRole("checkbox", { name: "Uudiskiri" })
            .check();

        await card(Q.country).getByRole("combobox").selectOption("ee");

        await card(Q.city).getByRole("textbox").fill(city);
        await card(Q.feedback).getByRole("textbox").fill("Kõik toimis hästi.");

        await card(Q.satisfaction)
            .getByRole("radio", { name: "4", exact: true })
            .check();
        await card(Q.recommend)
            .getByRole("radio", { name: "9", exact: true })
            .check();

        for (const [row, answer] of [
            ["Kiirus", "Hea"],
            ["Selgus", "Rahuldav"],
            ["Tugi", "Hea"]
        ] as const) {
            await card(Q.teamRatings)
                .getByRole("radiogroup", { name: row })
                .getByRole("radio", { name: answer })
                .check();
        }

        // Everything answered: the progress bar is full and nothing is blocking.
        await expect(page.getByRole("progressbar")).toHaveAttribute(
            "aria-valuenow",
            "8"
        );

        await page.getByRole("button", { name: "Saada vastused" }).click();
        await expect(
            page.getByRole("heading", { name: "Aitäh vastamast!" })
        ).toBeVisible();

        // --- and it is in the database ---------------------------------------

        const db = serviceDb();
        const { data: mine } = await db
            .from("answers")
            .select("response_id")
            .eq("survey_id", SURVEY_ID)
            .eq("question_id", Q.city)
            .eq("value->>value", city)
            .single();

        expect(mine?.response_id).toBeDefined();
        const responseId = mine?.response_id as string;

        const { data: answers } = await db
            .from("answers")
            .select("question_id, value")
            .eq("response_id", responseId);

        expect(
            Object.fromEntries(
                (answers ?? []).map(row => [row.question_id, row.value])
            )
        ).toEqual({
            [Q.role]: { type: "single_choice", value: "teacher" },
            [Q.channels]: {
                type: "multi_choice",
                values: ["email", "newsletter"]
            },
            [Q.country]: { type: "dropdown", value: "ee" },
            [Q.city]: { type: "short_text", value: city },
            [Q.feedback]: { type: "long_text", value: "Kõik toimis hästi." },
            [Q.satisfaction]: { type: "opinion_scale", value: 4 },
            [Q.recommend]: { type: "nps", value: 9 },
            [Q.teamRatings]: {
                type: "matrix_single",
                values: { speed: "good", clarity: "ok", support: "good" }
            }
        });

        // The statement block has no answer row, and neither does anything the
        // respondent skipped.
        expect(answers?.some(row => row.question_id === Q.intro)).toBe(false);

        const { data: response } = await db
            .from("responses")
            .select("survey_version, locale")
            .eq("id", responseId)
            .single();
        expect(response).toMatchObject({ locale: "et", survey_version: 1 });

        // The runner's own analytics reached the beacon endpoint. Polled
        // because the queue is debounced and deliberately not awaited by
        // anything the respondent did.
        await expect
            .poll(
                async () => {
                    const { data } = await db
                        .from("survey_events")
                        .select("type")
                        .eq("survey_id", SURVEY_ID)
                        .gte("at", startedAt);
                    return [
                        ...new Set((data ?? []).map(row => row.type))
                    ].sort();
                },
                { timeout: 10_000 }
            )
            .toEqual(
                expect.arrayContaining([
                    "question_answer",
                    "question_view",
                    "start",
                    "submit",
                    "view"
                ])
            );
    });

    test("tells a stranger when the link matches nothing", async ({ page }) => {
        const response = await page.goto("/k/ei-ole-olemas");
        expect(response?.status()).toBe(404);
        await expect(
            page.getByRole("heading", { name: "Küsitlust ei leitud" })
        ).toBeVisible();
    });
});
