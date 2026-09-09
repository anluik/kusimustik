import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { newQuestionId } from "@/domain/ids";
import type { AuthoredElement } from "@/domain/question";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import {
    createSurvey,
    getRunnerSurveyBySlug,
    publishSurvey
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";

/**
 * The runner's read, in the language the respondent asked for
 * (docs/PLAN.md Phase 12 step 3, docs/DECISIONS.md 033).
 *
 * This is the one place a document is resolved on behalf of somebody other
 * than its author, and the three cases below are the whole contract: the
 * language asked for when it is on offer, the fallback per *field* rather than
 * per survey, and a language the survey is not offered in refused rather than
 * quietly served through the fallback.
 */

/** Written in both languages. */
const both: AuthoredElement = {
    type: "short_text",
    isAnswerable: true,
    id: newQuestionId(),
    key: "city",
    title: { et: "Linn", ru: "Город" },
    required: false
};

/** Written in Estonian and not yet translated — a normal, publishable state. */
const estonianOnly: AuthoredElement = {
    type: "short_text",
    isAnswerable: true,
    id: newQuestionId(),
    key: "street",
    title: { et: "Tänav" },
    required: false
};

let owner: TestUser;
let survey: SurveyRecord;
let slug: string;

beforeAll(async () => {
    owner = await createTestUser("runner-locale");
    survey = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: "Kakskeelne",
        locale: "et",
        locales: ["et", "ru"],
        elements: [both, estonianOnly]
    });
    slug = testSlug("kakskeelne");
    survey = await publishSurvey(owner.db, survey.survey.id, slug);
});

afterAll(async () => {
    await deleteTestUser(owner);
});

const titles = (elements: readonly { readonly title: string }[]) =>
    elements.map(element => element.title);

describe("getRunnerSurveyBySlug", () => {
    it("serves the language the survey is written in when the URL names none", async () => {
        const found = await getRunnerSurveyBySlug(anonClient(), slug);

        expect(found?.locale).toBe("et");
        expect(titles(found?.survey.elements ?? [])).toEqual(["Linn", "Tänav"]);
    });

    it("serves the language asked for, falling back field by field", async () => {
        const found = await getRunnerSurveyBySlug(anonClient(), slug, "ru");

        expect(found?.locale).toBe("ru");
        // The untranslated question is the survey's own words, not a blank
        // card: a half-finished translation is a normal state.
        expect(titles(found?.survey.elements ?? [])).toEqual([
            "Город",
            "Tänav"
        ]);
    });

    it("keeps `survey.locale` the language the survey was written in", async () => {
        const found = await getRunnerSurveyBySlug(anonClient(), slug, "ru");

        // Resolving does not rewrite it: it is still the fallback, and it is
        // what tells the picker which URL is the canonical one.
        expect(found?.survey.locale).toBe("et");
        expect(found?.survey.locales).toEqual(["et", "ru"]);
    });

    it("refuses a language the survey is not offered in", async () => {
        const found = await getRunnerSurveyBySlug(anonClient(), slug, "en");

        expect(found?.locale).toBe("et");
        expect(titles(found?.survey.elements ?? [])).toEqual(["Linn", "Tänav"]);
    });
});
