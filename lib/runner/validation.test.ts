import { describe, expect, it } from "vitest";

import { OTHER_OPTION_VALUE } from "@/domain/question";
import {
    ALL_ELEMENTS,
    ALL_QUESTIONS,
    Q,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    singleChoice
} from "@/domain/test-fixtures";
import type { AnswerDraft } from "@/lib/runner/validation";
import {
    answerProgress,
    validateAll,
    validateAnswer
} from "@/lib/runner/validation";

/**
 * The contract this module owes the runner: it never disagrees with
 * `buildAnswerSchema` about whether an answer is acceptable, and when it is
 * not, it names a reason the message catalogue has copy for.
 */

const COMPLETE: AnswerDraft = {
    [Q.role]: { type: "single_choice", value: "dev" },
    [Q.channels]: { type: "multi_choice", values: ["email", "slack"] },
    [Q.country]: { type: "dropdown", value: "ee" },
    [Q.city]: { type: "short_text", value: "Tartu" },
    [Q.feedback]: { type: "long_text", value: "All good." },
    [Q.satisfaction]: { type: "opinion_scale", value: 4 },
    [Q.recommend]: { type: "nps", value: 9 },
    [Q.teamRatings]: {
        type: "matrix_single",
        values: { speed: "high", quality: "mid" }
    }
};

describe("validateAnswer", () => {
    it("accepts a valid answer to every question type", () => {
        for (const question of ALL_QUESTIONS) {
            expect([
                question.key,
                validateAnswer(question, COMPLETE[question.id] ?? null)
            ]).toEqual([question.key, null]);
        }
    });

    it("reports a required question left blank", () => {
        expect(validateAnswer(singleChoice, null)).toEqual({
            code: "required"
        });
        expect(validateAnswer(nps, null)).toEqual({ code: "required" });
    });

    it("accepts an optional question left blank", () => {
        expect(validateAnswer(shortText, null)).toBeNull();
        expect(validateAnswer(longText, null)).toBeNull();
    });

    it("counts the selections a multi_choice is short of or over", () => {
        expect(
            validateAnswer(multiChoice, {
                type: "multi_choice",
                values: ["email"]
            })
        ).toEqual({ code: "selectAtLeast", count: 2 });

        expect(
            validateAnswer(multiChoice, {
                type: "multi_choice",
                values: ["email", "slack", "phone", "in_person"]
            })
        ).toEqual({ code: "selectAtMost", count: 3 });
    });

    it("asks for the written answer when the free-text option is chosen", () => {
        expect(
            validateAnswer(singleChoice, {
                type: "single_choice",
                value: OTHER_OPTION_VALUE,
                other: "   "
            })
        ).toEqual({ code: "otherRequired" });
    });

    it("counts the matrix rows still unanswered", () => {
        expect(
            validateAnswer(matrixSingle, {
                type: "matrix_single",
                values: { speed: "high" }
            })
        ).toEqual({ code: "matrixIncomplete", count: 1 });
    });

    it("names the limit a text answer exceeded", () => {
        expect(
            validateAnswer(shortText, {
                type: "short_text",
                value: "x".repeat(51)
            })
        ).toEqual({ code: "tooLong", count: 50 });
    });

    it("falls back to `invalid` for an envelope of the wrong type", () => {
        // Only reachable from a stale draft or a hand-made request; the
        // controls cannot produce it.
        expect(validateAnswer(opinionScale, { type: "nps", value: 9 })).toEqual(
            { code: "invalid" }
        );

        expect(
            validateAnswer(dropdown, { type: "dropdown", value: "gone" })
        ).toEqual({ code: "invalid" });
    });
});

describe("validateAll", () => {
    it("finds nothing wrong with a complete draft", () => {
        expect(validateAll(ALL_ELEMENTS, COMPLETE)).toEqual([]);
    });

    it("reports every unanswered required question, in document order", () => {
        expect(
            validateAll(ALL_ELEMENTS, {}).map(it => it.question.key)
        ).toEqual([
            "role",
            "channels",
            "country",
            "satisfaction",
            "recommend",
            "team_ratings"
        ]);
    });
});

describe("answerProgress", () => {
    it("counts answerable questions only — a statement is not progress", () => {
        expect(answerProgress(ALL_ELEMENTS, COMPLETE)).toEqual({
            answered: 8,
            total: 8
        });
        expect(answerProgress(ALL_ELEMENTS, {})).toEqual({
            answered: 0,
            total: 8
        });
    });

    it("does not count an answer that is present but unacceptable", () => {
        expect(
            answerProgress(ALL_ELEMENTS, {
                ...COMPLETE,
                [Q.channels]: { type: "multi_choice", values: ["email"] }
            })
        ).toEqual({ answered: 7, total: 8 });
    });
});
