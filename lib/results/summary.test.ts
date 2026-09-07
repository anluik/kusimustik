import { describe, expect, it } from "vitest";

import { surveyId } from "@/domain/ids";
import { buildQuestionResults } from "@/lib/results/summary";
import type { ResponseRecord } from "@/lib/db/responses";
import {
    ALL_ELEMENTS,
    RESPONSES,
    longText,
    nps,
    singleChoice,
    statement
} from "@/domain/test-fixtures";

const SURVEY = surveyId("11111111-1111-4111-8111-111111111111");

/** The domain fixtures as repository records. */
const RECORDS: readonly ResponseRecord[] = RESPONSES.map((response, index) => ({
    id: response.id,
    surveyId: SURVEY,
    surveyVersion: 1,
    locale: "et",
    submittedAt: new Date(Date.UTC(2026, 3, 1, index)).toISOString(),
    answers: Object.fromEntries(
        ALL_ELEMENTS.filter(element => element.isAnswerable)
            .map(question => [
                question.id,
                response.answers[question.key] ?? null
            ])
            .filter(([, value]) => value !== null)
    )
}));

describe("buildQuestionResults", () => {
    it("gives every answerable element a result, and statements none", () => {
        const results = buildQuestionResults(ALL_ELEMENTS, RECORDS);
        expect(results).toHaveLength(8);
        expect(results.map(r => r.question.id)).not.toContain(statement.id);
    });

    it("keeps document order", () => {
        const results = buildQuestionResults(ALL_ELEMENTS, RECORDS);
        expect(results[0]?.question.key).toBe(singleChoice.key);
        expect(results.at(-1)?.question.key).toBe("team_ratings");
    });

    it("pairs each question with a summary of its own kind", () => {
        const results = buildQuestionResults(ALL_ELEMENTS, RECORDS);
        const byKey = new Map(results.map(r => [r.question.key, r.summary]));
        expect(byKey.get(singleChoice.key)?.kind).toBe("categorical");
        expect(byKey.get(nps.key)?.kind).toBe("nps");
        expect(byKey.get(longText.key)?.kind).toBe("text");
    });

    it("keeps the whole response list as the denominator", () => {
        const results = buildQuestionResults(ALL_ELEMENTS, RECORDS);
        for (const { summary } of results) {
            expect(summary.responseCount).toBe(RECORDS.length);
            expect(summary.answeredCount + summary.skippedCount).toBe(
                RECORDS.length
            );
        }
    });

    it("still produces a card, at nought, for a question nobody answered", () => {
        // The absence is the finding; dropping the card would hide it.
        const results = buildQuestionResults(ALL_ELEMENTS, []);
        expect(results).toHaveLength(8);
        for (const { summary } of results) {
            expect(summary.responseCount).toBe(0);
            expect(summary.answeredCount).toBe(0);
        }
    });
});
