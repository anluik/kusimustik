import { describe, expect, it } from "vitest";

import {
    AuthoredSurveyHeadSchema,
    AuthoredSurveySchema,
    LOCALES,
    SURVEY_STATUSES,
    SurveyElementsSchema,
    SurveySchema
} from "@/domain/survey";
import { authoredSurvey, survey } from "@/domain/test-fixtures";

describe("SurveySchema", () => {
    it("round-trips the fixture survey", () => {
        expect(SurveySchema.parse(survey)).toEqual(survey);
    });

    it("knows three statuses and three locales", () => {
        expect([...SURVEY_STATUSES]).toEqual(["draft", "published", "closed"]);
        expect([...LOCALES]).toEqual(["et", "en", "ru"]);
    });

    it("allows a draft with no slug", () => {
        expect(
            SurveySchema.safeParse({ ...survey, status: "draft", slug: null })
                .success
        ).toBe(true);
    });

    it("requires a published survey to have a slug", () => {
        expect(
            SurveySchema.safeParse({
                ...survey,
                status: "published",
                slug: null
            }).success
        ).toBe(false);
    });

    it("requires slugs to be url-safe", () => {
        expect(
            SurveySchema.safeParse({ ...survey, slug: "Not A Slug" }).success
        ).toBe(false);
        expect(
            SurveySchema.safeParse({ ...survey, slug: "product-feedback-2026" })
                .success
        ).toBe(true);
    });

    it("rejects duplicate question keys — wave comparison joins on them", () => {
        const [first, second] = survey.elements;
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        if (!first || !second) return;
        const clashing = [
            first,
            { ...second, key: first.key },
            ...survey.elements.slice(2)
        ];
        expect(
            SurveySchema.safeParse({ ...survey, elements: clashing }).success
        ).toBe(false);
    });

    it("rejects duplicate question ids", () => {
        const [first, second] = survey.elements;
        if (!first || !second) return;
        const clashing = [
            first,
            { ...second, id: first.id },
            ...survey.elements.slice(2)
        ];
        expect(
            SurveySchema.safeParse({ ...survey, elements: clashing }).success
        ).toBe(false);
    });

    it("allows an empty survey — a draft starts with no elements", () => {
        expect(
            SurveySchema.safeParse({
                ...survey,
                status: "draft",
                slug: null,
                elements: []
            }).success
        ).toBe(true);
    });
});

describe("SurveyElementsSchema", () => {
    it("accepts the fixture's elements", () => {
        expect(SurveyElementsSchema.parse(survey.elements)).toEqual(
            survey.elements
        );
    });

    it("rejects two elements on one key, so the builder can gate its save", () => {
        const [first, second] = survey.elements;
        if (!first || !second) return;
        expect(
            SurveyElementsSchema.safeParse([
                first,
                { ...second, key: first.key }
            ]).success
        ).toBe(false);
    });

    it("rejects two elements on one id", () => {
        const [first, second] = survey.elements;
        if (!first || !second) return;
        expect(
            SurveyElementsSchema.safeParse([first, { ...second, id: first.id }])
                .success
        ).toBe(false);
    });

    it("accepts an empty document", () => {
        expect(SurveyElementsSchema.parse([])).toEqual([]);
    });
});

describe("the languages a survey is offered in", () => {
    it("always includes the one it is written in", () => {
        // Otherwise the fallback resolves through a language the runner does
        // not offer, and every untranslated field is unreachable.
        expect(
            SurveySchema.safeParse({ ...survey, locale: "en" }).success
        ).toBe(false);
        expect(
            SurveySchema.safeParse({
                ...survey,
                locale: "en",
                locales: ["et", "en"]
            }).success
        ).toBe(true);
    });

    it("is never empty: a survey nobody can be shown is not a state", () => {
        expect(SurveySchema.safeParse({ ...survey, locales: [] }).success).toBe(
            false
        );
    });

    it("is canonically ordered and free of duplicates", () => {
        // So two surveys offered in the same languages compare equal, and
        // every switcher lists them the same way round.
        expect(
            SurveySchema.safeParse({ ...survey, locales: ["en", "et"] }).success
        ).toBe(false);
        expect(
            SurveySchema.safeParse({ ...survey, locales: ["et", "et"] }).success
        ).toBe(false);
        expect(
            SurveySchema.safeParse({ ...survey, locales: ["et", "en", "ru"] })
                .success
        ).toBe(true);
    });
});

describe("the two shapes of a survey's own words", () => {
    it("stores the title as a map and renders it as a string", () => {
        expect(SurveySchema.safeParse(survey).success).toBe(true);
        expect(AuthoredSurveySchema.safeParse(authoredSurvey).success).toBe(
            true
        );
    });

    it("refuses each shape the other's title", () => {
        // The two are built from one pair of field objects, so this is what
        // would break first if they ever drifted apart.
        expect(
            AuthoredSurveySchema.safeParse({
                ...authoredSurvey,
                title: "Maine"
            }).success
        ).toBe(false);
        expect(
            SurveySchema.safeParse({ ...survey, title: { et: "Maine" } })
                .success
        ).toBe(false);
    });

    it("refuses a title written in no language at all", () => {
        // Not a translation state: a survey nobody can name is a document
        // nothing can render, and it is what the builder holds its save on.
        expect(AuthoredSurveyHeadSchema.safeParse({ title: {} }).success).toBe(
            false
        );
        expect(
            AuthoredSurveyHeadSchema.safeParse({ title: { et: "" } }).success
        ).toBe(false);
    });

    it("applies the length limit per language rather than in total", () => {
        const long = "x".repeat(300);
        expect(
            AuthoredSurveyHeadSchema.safeParse({
                title: { et: long, ru: long }
            }).success
        ).toBe(true);
        expect(
            AuthoredSurveyHeadSchema.safeParse({
                title: { et: `${long}x` }
            }).success
        ).toBe(false);
    });

    it("treats an intro nobody has written as absent, not as empty text", () => {
        expect(
            AuthoredSurveyHeadSchema.safeParse({ title: { et: "Maine" } })
                .success
        ).toBe(true);
        expect(
            AuthoredSurveyHeadSchema.safeParse({
                title: { et: "Maine" },
                description: {}
            }).success
        ).toBe(false);
    });
});
