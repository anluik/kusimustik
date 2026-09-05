import { describe, expect, it } from "vitest";

import { AnswerValueSchema, buildAnswerSchema } from "@/domain/answer";
import type { AnswerValue } from "@/domain/answer";
import type { AnswerableQuestion } from "@/domain/question";
import {
    ALL_QUESTIONS,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    singleChoice
} from "@/domain/test-fixtures";

/** One valid and one invalid answer for each of the eight answerable types. */
const ROUND_TRIP: ReadonlyArray<{
    readonly question: AnswerableQuestion;
    readonly valid: AnswerValue;
    readonly invalid: unknown;
    readonly why: string;
}> = [
    {
        question: singleChoice,
        valid: { type: "single_choice", value: "dev" },
        invalid: { type: "single_choice", value: "astronaut" },
        why: "value is not one of the options"
    },
    {
        question: multiChoice,
        valid: { type: "multi_choice", values: ["email", "slack"] },
        invalid: { type: "multi_choice", values: ["email", "carrier_pigeon"] },
        why: "one selected value is not an option"
    },
    {
        question: dropdown,
        valid: { type: "dropdown", value: "ee" },
        invalid: { type: "dropdown", value: "de" },
        why: "value is not one of the options"
    },
    {
        question: shortText,
        valid: { type: "short_text", value: "Tallinn" },
        invalid: { type: "short_text", value: "x".repeat(51) },
        why: "exceeds maxLength"
    },
    {
        question: longText,
        valid: { type: "long_text", value: "It works well." },
        invalid: { type: "long_text", value: 42 },
        why: "not a string"
    },
    {
        question: opinionScale,
        valid: { type: "opinion_scale", value: 4 },
        invalid: { type: "opinion_scale", value: 6 },
        why: "above the configured maximum"
    },
    {
        question: nps,
        valid: { type: "nps", value: 10 },
        invalid: { type: "nps", value: 11 },
        why: "above the fixed 0-10 range"
    },
    {
        question: matrixSingle,
        valid: {
            type: "matrix_single",
            values: { speed: "high", quality: "mid" }
        },
        invalid: {
            type: "matrix_single",
            values: { speed: "high", quality: "excellent" }
        },
        why: "a column value is not one of the columns"
    }
];

describe("buildAnswerSchema round trip", () => {
    it("covers every answerable question type", () => {
        expect(ROUND_TRIP.map(c => c.question.type).sort()).toEqual(
            ALL_QUESTIONS.map(q => q.type).sort()
        );
    });

    for (const { question, valid, invalid, why } of ROUND_TRIP) {
        it(`accepts a valid ${question.type} answer`, () => {
            expect(buildAnswerSchema(question).parse(valid)).toEqual(valid);
        });

        it(`rejects an invalid ${question.type} answer (${why})`, () => {
            expect(buildAnswerSchema(question).safeParse(invalid).success).toBe(
                false
            );
        });

        it(`rejects a ${question.type} answer tagged with the wrong type`, () => {
            const mismatched: Record<string, unknown> = {
                ...valid,
                type: valid.type === "long_text" ? "nps" : "long_text"
            };
            expect(
                buildAnswerSchema(question).safeParse(mismatched).success
            ).toBe(false);
        });
    }
});

describe("required vs optional", () => {
    for (const question of ALL_QUESTIONS) {
        it(`a required ${question.type} rejects null`, () => {
            expect(
                buildAnswerSchema({ ...question, required: true }).safeParse(
                    null
                ).success
            ).toBe(false);
        });

        it(`an optional ${question.type} accepts null`, () => {
            expect(
                buildAnswerSchema({ ...question, required: false }).parse(null)
            ).toBeNull();
        });
    }

    it("treats blank text as no answer, so a required text question rejects it", () => {
        expect(
            buildAnswerSchema({ ...shortText, required: true }).safeParse({
                type: "short_text",
                value: "   "
            }).success
        ).toBe(false);
        expect(
            buildAnswerSchema({ ...longText, required: true }).safeParse({
                type: "long_text",
                value: ""
            }).success
        ).toBe(false);
    });

    it("trims text answers on the way through", () => {
        expect(
            buildAnswerSchema(shortText).parse({
                type: "short_text",
                value: "  Tartu  "
            })
        ).toEqual({
            type: "short_text",
            value: "Tartu"
        });
    });

    it("still enforces the shape of an optional question that was answered", () => {
        const schema = buildAnswerSchema({ ...opinionScale, required: false });
        expect(schema.parse(null)).toBeNull();
        expect(
            schema.safeParse({ type: "opinion_scale", value: 99 }).success
        ).toBe(false);
    });
});

describe("multi_choice with min 2 and max 3", () => {
    const schema = buildAnswerSchema(multiChoice);

    it("accepts two selections", () => {
        expect(
            schema.parse({ type: "multi_choice", values: ["email", "slack"] })
        ).toEqual({
            type: "multi_choice",
            values: ["email", "slack"]
        });
    });

    it("accepts three selections", () => {
        expect(
            schema.safeParse({
                type: "multi_choice",
                values: ["email", "slack", "phone"]
            }).success
        ).toBe(true);
    });

    it("rejects one selection", () => {
        expect(
            schema.safeParse({ type: "multi_choice", values: ["email"] })
                .success
        ).toBe(false);
    });

    it("rejects four selections", () => {
        expect(
            schema.safeParse({
                type: "multi_choice",
                values: ["email", "slack", "phone", "in_person"]
            }).success
        ).toBe(false);
    });

    it("rejects an empty selection even though the array shape is right", () => {
        expect(
            schema.safeParse({ type: "multi_choice", values: [] }).success
        ).toBe(false);
    });

    it("rejects the same option selected twice", () => {
        expect(
            schema.safeParse({
                type: "multi_choice",
                values: ["email", "email"]
            }).success
        ).toBe(false);
    });

    it("lets an optional one be skipped entirely but not answered below the minimum", () => {
        const optional = buildAnswerSchema({ ...multiChoice, required: false });
        expect(optional.parse(null)).toBeNull();
        expect(
            optional.safeParse({ type: "multi_choice", values: ["email"] })
                .success
        ).toBe(false);
    });
});

describe("opinion_scale bounds", () => {
    const schema = buildAnswerSchema(opinionScale);

    it("accepts every step in range", () => {
        for (const value of [1, 2, 3, 4, 5]) {
            expect(
                schema.safeParse({ type: "opinion_scale", value }).success
            ).toBe(true);
        }
    });

    it("rejects out-of-range values", () => {
        for (const value of [0, -1, 6, 15]) {
            expect(
                schema.safeParse({ type: "opinion_scale", value }).success
            ).toBe(false);
        }
    });

    it("rejects non-integers", () => {
        expect(
            schema.safeParse({ type: "opinion_scale", value: 3.5 }).success
        ).toBe(false);
    });
});

describe("nps bounds", () => {
    const schema = buildAnswerSchema(nps);

    it("accepts 0 through 10", () => {
        for (let value = 0; value <= 10; value += 1) {
            expect(schema.safeParse({ type: "nps", value }).success).toBe(true);
        }
    });

    it("rejects -1 and 11", () => {
        expect(schema.safeParse({ type: "nps", value: -1 }).success).toBe(
            false
        );
        expect(schema.safeParse({ type: "nps", value: 11 }).success).toBe(
            false
        );
    });
});

describe("matrix_single row coverage", () => {
    const schema = buildAnswerSchema(matrixSingle);

    it("accepts a complete row set", () => {
        expect(
            schema.parse({
                type: "matrix_single",
                values: { speed: "high", quality: "low" }
            })
        ).toEqual({
            type: "matrix_single",
            values: { speed: "high", quality: "low" }
        });
    });

    it("rejects a partial row set", () => {
        expect(
            schema.safeParse({
                type: "matrix_single",
                values: { speed: "high" }
            }).success
        ).toBe(false);
    });

    it("rejects an unknown row", () => {
        expect(
            schema.safeParse({
                type: "matrix_single",
                values: { speed: "high", quality: "low", cost: "low" }
            }).success
        ).toBe(false);
    });

    it("rejects a partial row set on an optional matrix too — skip it or complete it", () => {
        const optional = buildAnswerSchema({
            ...matrixSingle,
            required: false
        });
        expect(optional.parse(null)).toBeNull();
        expect(
            optional.safeParse({
                type: "matrix_single",
                values: { speed: "high" }
            }).success
        ).toBe(false);
    });
});

describe("the 'other' option", () => {
    it("accepts the sentinel with free text when allowOther is set", () => {
        expect(
            buildAnswerSchema(singleChoice).parse({
                type: "single_choice",
                value: "__other__",
                other: "Student"
            })
        ).toEqual({
            type: "single_choice",
            value: "__other__",
            other: "Student"
        });
    });

    it("rejects the sentinel without free text", () => {
        expect(
            buildAnswerSchema(singleChoice).safeParse({
                type: "single_choice",
                value: "__other__"
            }).success
        ).toBe(false);
    });

    it("rejects the sentinel when the question does not allow other", () => {
        expect(
            buildAnswerSchema({ ...singleChoice, allowOther: false }).safeParse(
                {
                    type: "single_choice",
                    value: "__other__",
                    other: "Student"
                }
            ).success
        ).toBe(false);
    });

    it("rejects free text alongside a real option", () => {
        expect(
            buildAnswerSchema(singleChoice).safeParse({
                type: "single_choice",
                value: "dev",
                other: "Student"
            }).success
        ).toBe(false);
    });
});

describe("AnswerValueSchema", () => {
    it("validates the storage envelope without knowing the question", () => {
        expect(
            AnswerValueSchema.safeParse({ type: "nps", value: 7 }).success
        ).toBe(true);
        expect(
            AnswerValueSchema.safeParse({ type: "statement", value: 7 }).success
        ).toBe(false);
        expect(
            AnswerValueSchema.safeParse({ type: "nps", value: 700 }).success
        ).toBe(false);
    });
});
