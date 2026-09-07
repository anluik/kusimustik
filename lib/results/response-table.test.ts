import { describe, expect, it } from "vitest";

import type { AnswerValue } from "@/domain/answer";
import { OTHER_OPTION_VALUE } from "@/domain/question";
import {
    buildResponseRows,
    matchesResponseSearch,
    tableQuestions,
    toAnswerDisplay
} from "@/lib/results/response-table";
import type { ResponseRecord } from "@/lib/db/responses";
import {
    ALL_ELEMENTS,
    ALL_QUESTIONS,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    must,
    singleChoice,
    statement
} from "@/domain/test-fixtures";
import { responseId } from "@/domain/ids";

describe("toAnswerDisplay", () => {
    it("is total: every question yields a display for a skipped answer", () => {
        for (const question of ALL_QUESTIONS) {
            expect(toAnswerDisplay(question, null)).toEqual({ kind: "empty" });
        }
    });

    it("is empty for an answer whose type does not match the question", () => {
        // A question retyped after collection: the envelope no longer narrows,
        // and showing the wrong reading of it would be worse than showing none.
        const mismatched: AnswerValue = { type: "nps", value: 9 };
        expect(toAnswerDisplay(singleChoice, mismatched)).toEqual({
            kind: "empty"
        });
    });

    describe("choice questions", () => {
        it("shows the option label, not the stored value", () => {
            expect(
                toAnswerDisplay(singleChoice, {
                    type: "single_choice",
                    value: "dev"
                })
            ).toEqual({ kind: "list", items: ["Developer"] });
        });

        it("falls back to the stored value for a deleted option", () => {
            expect(
                toAnswerDisplay(dropdown, { type: "dropdown", value: "no" })
            ).toEqual({ kind: "list", items: ["no"] });
        });

        it("shows what the respondent typed for an 'other' answer", () => {
            expect(
                toAnswerDisplay(singleChoice, {
                    type: "single_choice",
                    value: OTHER_OPTION_VALUE,
                    other: "Researcher"
                })
            ).toEqual({ kind: "text", text: "Researcher" });
        });

        it("falls back to the 'other' label when nothing was typed", () => {
            expect(
                toAnswerDisplay(singleChoice, {
                    type: "single_choice",
                    value: OTHER_OPTION_VALUE
                })
            ).toEqual({ kind: "list", items: ["Other"] });
        });

        it("lists a multi-choice in the question's order, not the answer's", () => {
            expect(
                toAnswerDisplay(multiChoice, {
                    type: "multi_choice",
                    values: ["phone", "email"]
                })
            ).toEqual({ kind: "list", items: ["Email", "Phone"] });
        });

        it("treats an empty selection as empty", () => {
            expect(
                toAnswerDisplay(multiChoice, {
                    type: "multi_choice",
                    values: []
                })
            ).toEqual({ kind: "empty" });
        });
    });

    describe("text questions", () => {
        it("shows the text", () => {
            expect(
                toAnswerDisplay(shortText, {
                    type: "short_text",
                    value: "Tartu"
                })
            ).toEqual({ kind: "text", text: "Tartu" });
        });

        it("treats an empty string as empty, never as an answer", () => {
            expect(
                toAnswerDisplay(longText, { type: "long_text", value: "" })
            ).toEqual({ kind: "empty" });
        });
    });

    describe("scored questions", () => {
        it("carries the scale's bounds so the cell can show 4 of 5", () => {
            expect(
                toAnswerDisplay(opinionScale, {
                    type: "opinion_scale",
                    value: 4
                })
            ).toEqual({ kind: "score", value: 4, min: 1, max: 5 });
        });

        it("uses the fixed NPS bounds", () => {
            expect(toAnswerDisplay(nps, { type: "nps", value: 9 })).toEqual({
                kind: "score",
                value: 9,
                min: 0,
                max: 10
            });
        });

        it("keeps a zero score, which is an answer and not a skip", () => {
            const display = toAnswerDisplay(nps, { type: "nps", value: 0 });
            expect(display.kind).toBe("score");
        });
    });

    describe("the matrix", () => {
        it("pairs each row with its chosen column label", () => {
            expect(
                toAnswerDisplay(matrixSingle, {
                    type: "matrix_single",
                    values: { speed: "high", quality: "low" }
                })
            ).toEqual({
                kind: "pairs",
                pairs: [
                    { key: "speed", label: "Speed", value: "High" },
                    { key: "quality", label: "Quality", value: "Low" }
                ]
            });
        });

        it("omits a row that was not answered rather than blanking it", () => {
            const display = toAnswerDisplay(matrixSingle, {
                type: "matrix_single",
                values: { speed: "high" }
            });
            expect(display).toEqual({
                kind: "pairs",
                pairs: [{ key: "speed", label: "Speed", value: "High" }]
            });
        });

        it("is empty when no row was answered", () => {
            expect(
                toAnswerDisplay(matrixSingle, {
                    type: "matrix_single",
                    values: {}
                })
            ).toEqual({ kind: "empty" });
        });
    });
});

describe("tableQuestions", () => {
    it("drops statement blocks and keeps document order", () => {
        const questions = tableQuestions(ALL_ELEMENTS);
        expect(questions).toHaveLength(8);
        expect(questions.map(q => q.id)).not.toContain(statement.id);
        expect(questions[0]?.key).toBe(singleChoice.key);
    });
});

describe("buildResponseRows", () => {
    const response: ResponseRecord = {
        id: responseId("55555555-5555-4555-8555-555555555555"),
        surveyId: "11111111-1111-4111-8111-111111111111" as never,
        surveyVersion: 3,
        locale: "et",
        submittedAt: "2026-04-02T10:00:00.000Z",
        answers: {
            [singleChoice.id]: { type: "single_choice", value: "pm" },
            [nps.id]: { type: "nps", value: 7 }
        }
    };

    it("gives every question a cell, answered or not", () => {
        const [row] = buildResponseRows(ALL_ELEMENTS, [response]);
        expect(row?.cells.size).toBe(8);
        expect(row?.cells.get(singleChoice.id)).toEqual({
            kind: "list",
            items: ["Product manager"]
        });
        expect(row?.cells.get(shortText.id)).toEqual({ kind: "empty" });
    });

    it("carries the version the respondent actually saw", () => {
        const [row] = buildResponseRows(ALL_ELEMENTS, [response]);
        expect(row?.surveyVersion).toBe(3);
    });

    it("returns one row per response, in the order given", () => {
        const second = {
            ...response,
            id: responseId("55555555-5555-4555-8555-555555555556")
        };
        const rows = buildResponseRows(ALL_ELEMENTS, [response, second]);
        expect(rows.map(r => r.id)).toEqual([response.id, second.id]);
    });

    it("has no rows and no crash for a survey nobody has answered", () => {
        expect(buildResponseRows(ALL_ELEMENTS, [])).toEqual([]);
    });

    describe("search text", () => {
        it("collects the labels and free text of every cell", () => {
            const [row] = buildResponseRows(ALL_ELEMENTS, [response]);
            expect(row?.searchText).toContain("product manager");
            expect(row?.searchText).toContain("7");
        });

        it("is lowercased so the search need not be", () => {
            const [row] = buildResponseRows(ALL_ELEMENTS, [response]);
            expect(row?.searchText).toBe(row?.searchText.toLowerCase());
        });
    });
});

describe("matchesResponseSearch", () => {
    const [row] = buildResponseRows(ALL_ELEMENTS, [
        {
            id: responseId("55555555-5555-4555-8555-555555555555"),
            surveyId: "11111111-1111-4111-8111-111111111111" as never,
            surveyVersion: 1,
            locale: "et",
            submittedAt: "2026-04-02T10:00:00.000Z",
            answers: {
                [singleChoice.id]: { type: "single_choice", value: "design" },
                [longText.id]: {
                    type: "long_text",
                    value: "Rohkem infot palun"
                }
            }
        }
    ]);

    it("matches an empty query", () => {
        expect(matchesResponseSearch(must(row, "row"), "")).toBe(true);
        expect(matchesResponseSearch(must(row, "row"), "   ")).toBe(true);
    });

    it("matches regardless of case", () => {
        expect(matchesResponseSearch(must(row, "row"), "DESIGNER")).toBe(true);
    });

    it("matches inside free text", () => {
        expect(matchesResponseSearch(must(row, "row"), "infot")).toBe(true);
    });

    it("does not match what is not there", () => {
        expect(matchesResponseSearch(must(row, "row"), "developer")).toBe(
            false
        );
    });
});
