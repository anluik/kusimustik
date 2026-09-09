import { describe, expect, it } from "vitest";

import { duplicateSurvey } from "@/domain/duplicate";
import { AuthoredSurveySchema } from "@/domain/survey";
import { authoredSurvey as survey } from "@/domain/test-fixtures";

describe("duplicateSurvey", () => {
    const copy = duplicateSurvey(survey);

    it("produces a survey that still parses", () => {
        expect(AuthoredSurveySchema.parse(copy)).toEqual(copy);
    });

    it("gives the copy a fresh survey id", () => {
        expect(copy.id).not.toBe(survey.id);
    });

    it("gives every element a fresh question id", () => {
        const originalIds = new Set(survey.elements.map(e => e.id));
        for (const element of copy.elements) {
            expect(originalIds.has(element.id)).toBe(false);
        }
        expect(new Set(copy.elements.map(e => e.id)).size).toBe(
            copy.elements.length
        );
    });

    it("preserves every question key, in order — this is what wave comparison joins on", () => {
        expect(copy.elements.map(e => e.key)).toEqual(
            survey.elements.map(e => e.key)
        );
    });

    it("preserves the wave group id", () => {
        expect(copy.waveGroupId).toBe(survey.waveGroupId);
    });

    it("copies element configuration verbatim apart from the id", () => {
        for (const [i, element] of copy.elements.entries()) {
            const original = survey.elements[i];
            expect(original).toBeDefined();
            if (!original) return;
            expect({ ...element, id: original.id }).toEqual(original);
        }
    });

    it("comes back as an unpublished draft with no slug, so it cannot hijack the live link", () => {
        expect(survey.status).toBe("published");
        expect(copy.status).toBe("draft");
        expect(copy.slug).toBeNull();
    });

    it("keeps the source title unless one is given — a new wave is the same survey", () => {
        expect(copy.title).toBe(survey.title);
        expect(
            duplicateSurvey(survey, { title: "Product feedback (2027)" }).title
        ).toBe("Product feedback (2027)");
    });

    it("takes a new wave label, and drops the old one when asked", () => {
        expect(copy.waveLabel).toBe(survey.waveLabel);
        expect(duplicateSurvey(survey, { waveLabel: "2027" }).waveLabel).toBe(
            "2027"
        );
        expect(
            duplicateSurvey(survey, { waveLabel: null }).waveLabel
        ).toBeUndefined();
    });

    it("can start a new wave group for an unrelated copy", () => {
        const forked = duplicateSurvey(survey, { newWaveGroup: true });
        expect(forked.waveGroupId).not.toBe(survey.waveGroupId);
        expect(forked.elements.map(e => e.key)).toEqual(
            survey.elements.map(e => e.key)
        );
    });

    it("accepts injected id generators so callers can be deterministic", () => {
        let n = 0;
        const deterministic = duplicateSurvey(survey, {
            generateSurveyId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            generateQuestionId: () => {
                n += 1;
                return `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;
            }
        });
        expect(deterministic.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        expect(deterministic.elements[0]?.id).toBe(
            "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"
        );
        expect(n).toBe(survey.elements.length);
    });

    it("is not shallow — mutating the copy cannot reach the original", () => {
        const first = copy.elements[0];
        const originalFirst = survey.elements[0];
        if (!first || !originalFirst) return;
        expect(first).not.toBe(originalFirst);
    });
});
