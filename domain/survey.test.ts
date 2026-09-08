import { describe, expect, it } from "vitest";

import {
    LOCALES,
    SURVEY_STATUSES,
    SurveyElementsSchema,
    SurveySchema
} from "@/domain/survey";
import { survey } from "@/domain/test-fixtures";

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
