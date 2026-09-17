import { describe, expect, it } from "vitest";

import type {
    ComparisonDocument,
    ComparisonRow,
    ComparisonWave
} from "@/domain/comparison";
import type { QuestionId, SurveyId } from "@/domain/ids";
import { newComparisonRowId, newQuestionId, surveyId } from "@/domain/ids";
import type { AnswerableQuestion } from "@/domain/question";
import { nps, opinionScale, shortText } from "@/domain/test-fixtures";
import { checkComparisonSave } from "@/lib/comparisons/validate";
import type { RemovedLookup } from "@/lib/comparisons/validate";

const W1 = surveyId("aaaaaaaa-0000-4000-8000-000000000001");
const W2 = surveyId("aaaaaaaa-0000-4000-8000-000000000002");
const W3 = surveyId("aaaaaaaa-0000-4000-8000-000000000003");
const OTHER = surveyId("aaaaaaaa-0000-4000-8000-00000000000f");

const copy = <Q extends AnswerableQuestion>(
    question: Q,
    patch: Partial<Q> = {}
): Q => ({
    ...question,
    ...patch,
    id: newQuestionId()
});

const one = { nps: copy(nps), text: copy(shortText) };
const two = { nps: copy(nps), text: copy(shortText) };
const three = { nps: copy(nps) };

const WAVES: readonly ComparisonWave[] = [
    { surveyId: W1, elements: [one.nps, one.text] },
    { surveyId: W2, elements: [two.nps, two.text] },
    { surveyId: W3, elements: [three.nps] }
];

const NONE: RemovedLookup = new Map();

function row(matches: readonly [SurveyId, QuestionId][]): ComparisonRow {
    return {
        id: newComparisonRowId(),
        matches: matches.map(([s, q]) => ({ surveyId: s, questionId: q }))
    };
}

function doc(
    rows: readonly ComparisonRow[],
    surveyIds: readonly SurveyId[] = [W1, W2]
): ComparisonDocument {
    return { name: "Test", surveyIds: [...surveyIds], rows: [...rows] };
}

describe("checkComparisonSave", () => {
    it("accepts a legal document and orders its waves by age", () => {
        const next = doc(
            [
                row([
                    [W2, two.nps.id],
                    [W1, one.nps.id]
                ])
            ],
            [W2, W1]
        );
        const result = checkComparisonSave({
            waves: WAVES,
            removed: NONE,
            stored: doc([]),
            next
        });
        expect(result.ok && result.document.surveyIds).toEqual([W1, W2]);
    });

    it("refuses a wave from outside the group", () => {
        expect(
            checkComparisonSave({
                waves: WAVES,
                removed: NONE,
                stored: doc([]),
                next: doc([], [W1, OTHER])
            })
        ).toEqual({ ok: false, error: "invalidInput" });
    });

    it("refuses a changed row that mixes types", () => {
        expect(
            checkComparisonSave({
                waves: WAVES,
                removed: NONE,
                stored: doc([]),
                next: doc([
                    row([
                        [W1, one.nps.id],
                        [W2, two.text.id]
                    ])
                ])
            })
        ).toEqual({ ok: false, error: "refused" });
    });

    it("lets an untouched row through even if it no longer holds", () => {
        // W2's question became a text question in the builder after the owner
        // matched it. The owner is editing a different row; that save must go.
        const stale = row([
            [W1, one.nps.id],
            [W2, two.text.id]
        ]);
        const fresh = row([[W1, one.text.id]]);
        const result = checkComparisonSave({
            waves: WAVES,
            removed: NONE,
            stored: doc([stale]),
            next: doc([stale, fresh])
        });
        expect(result.ok && result.document.rows).toEqual([stale, fresh]);
    });

    it("judges a row whose matches changed, even under its old id", () => {
        const before = row([[W1, one.nps.id]]);
        const after = {
            ...before,
            matches: [
                ...before.matches,
                { surveyId: W2, questionId: two.text.id }
            ]
        };
        expect(
            checkComparisonSave({
                waves: WAVES,
                removed: NONE,
                stored: doc([before]),
                next: doc([after])
            })
        ).toEqual({ ok: false, error: "refused" });
    });

    it("drops a match whose question has left its wave, and the row it empties", () => {
        const vanished = newQuestionId();
        const result = checkComparisonSave({
            waves: WAVES,
            removed: NONE,
            stored: doc([]),
            next: doc([
                row([
                    [W1, one.nps.id],
                    [W2, vanished]
                ]),
                row([[W2, newQuestionId()]])
            ])
        });
        expect(result.ok && result.document.rows.map(r => r.matches)).toEqual([
            [{ surveyId: W1, questionId: one.nps.id }]
        ]);
    });

    it("judges a removed question by its last definition", () => {
        const gone = copy(opinionScale, { max: 7 });
        const removed: RemovedLookup = new Map([
            [gone.id, { surveyId: W2, question: gone }]
        ]);
        const scale = copy(opinionScale);
        const waves: ComparisonWave[] = [
            { surveyId: W1, elements: [scale] },
            { surveyId: W2, elements: [] }
        ];
        expect(
            checkComparisonSave({
                waves,
                removed,
                stored: doc([]),
                next: doc([
                    row([
                        [W1, scale.id],
                        [W2, gone.id]
                    ])
                ])
            })
        ).toEqual({ ok: false, error: "refused" });
    });

    it("does not accept a question claimed for the wrong wave", () => {
        const result = checkComparisonSave({
            waves: WAVES,
            removed: NONE,
            stored: doc([]),
            next: doc([
                row([
                    [W1, one.nps.id],
                    [W2, three.nps.id]
                ])
            ])
        });
        expect(result.ok && result.document.rows[0]?.matches).toEqual([
            { surveyId: W1, questionId: one.nps.id }
        ]);
    });
});
