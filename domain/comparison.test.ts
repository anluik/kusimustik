import { describe, expect, it } from "vitest";

import {
    ComparisonDocumentSchema,
    MAX_COMPARED_WAVES,
    NewComparisonSchema,
    type ComparisonRow,
    type ComparisonWave,
    candidateVerdict,
    matchVerdict,
    normalizeWording,
    orderRows,
    pruneRows,
    rowVerdict,
    suggestMatches
} from "@/domain/comparison";
import type { ComparisonRowId, QuestionId, SurveyId } from "@/domain/ids";
import {
    comparisonRowId,
    newComparisonRowId,
    newQuestionId,
    surveyId
} from "@/domain/ids";
import type { AnswerableQuestion, SurveyElement } from "@/domain/question";
import {
    ALL_QUESTIONS,
    dropdown,
    nps,
    opinionScale,
    shortText,
    singleChoice,
    statement
} from "@/domain/test-fixtures";

const W1 = surveyId("aaaaaaaa-0000-4000-8000-000000000001");
const W2 = surveyId("aaaaaaaa-0000-4000-8000-000000000002");
const W3 = surveyId("aaaaaaaa-0000-4000-8000-000000000003");

/** A fresh copy of a question, as a later wave's duplicate would hold it. */
function copy<Q extends AnswerableQuestion>(
    question: Q,
    patch: Partial<Q> = {}
): Q {
    return { ...question, ...patch, id: newQuestionId() };
}

function wave(
    id: SurveyId,
    elements: readonly SurveyElement[]
): ComparisonWave {
    return { surveyId: id, elements };
}

/** Deterministic row ids, so suggestions can be compared whole. */
function rowIds(): () => ComparisonRowId {
    let n = 0;
    return () => {
        n += 1;
        return comparisonRowId(
            `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`
        );
    };
}

function row(
    matches: readonly [SurveyId, QuestionId][],
    id: ComparisonRowId = newComparisonRowId()
): ComparisonRow {
    return {
        id,
        matches: matches.map(([survey, question]) => ({
            surveyId: survey,
            questionId: question
        }))
    };
}

/** The rows as `[wave, question]` pairs, which is what a test cares about. */
function shape(rows: readonly ComparisonRow[]) {
    return rows.map(r => r.matches.map(m => [m.surveyId, m.questionId]));
}

describe("matchVerdict", () => {
    it("accepts every type against itself", () => {
        for (const question of ALL_QUESTIONS) {
            expect(matchVerdict(question, copy(question))).toEqual({
                ok: true
            });
        }
    });

    it("refuses two different types, however alike they look", () => {
        // A dropdown and a single choice both pick one option, and are still
        // not the same question: the owner's rule is the type, nothing looser.
        expect(matchVerdict(singleChoice, dropdown)).toEqual({
            ok: false,
            reason: "typeMismatch"
        });
        expect(matchVerdict(nps, opinionScale)).toEqual({
            ok: false,
            reason: "typeMismatch"
        });
    });

    it("refuses two opinion scales of different lengths", () => {
        expect(
            matchVerdict(opinionScale, copy(opinionScale, { max: 7 }))
        ).toEqual({ ok: false, reason: "scaleMismatch" });
    });

    it("accepts choice questions whose options differ", () => {
        // Options are matched by value when the row is drawn; one a wave did
        // not offer is shown as not offered, not refused.
        const reworded = copy(singleChoice, {
            options: [{ value: "other_value", label: "Something else" }]
        });
        expect(matchVerdict(singleChoice, reworded)).toEqual({ ok: true });
    });
});

describe("rowVerdict", () => {
    it("holds every question in the row to the first", () => {
        expect(rowVerdict([nps, copy(nps), copy(nps)])).toEqual({ ok: true });
        expect(rowVerdict([nps, copy(nps), shortText])).toEqual({
            ok: false,
            reason: "typeMismatch"
        });
    });

    it("has nothing to refuse in a row of one or none", () => {
        expect(rowVerdict([])).toEqual({ ok: true });
        expect(rowVerdict([nps])).toEqual({ ok: true });
    });
});

describe("candidateVerdict", () => {
    it("judges a candidate against the row's questions in other waves", () => {
        const waves = [wave(W1, [nps]), wave(W2, [copy(nps), shortText])];
        const second = waves[1]?.elements;
        const [npsTwo, text] = [second?.[0], second?.[1]];
        if (npsTwo === undefined || text === undefined) throw new Error();

        const current = row([[W1, nps.id]]);
        expect(candidateVerdict(waves, current, W2, npsTwo.id)).toEqual({
            ok: true
        });
        expect(candidateVerdict(waves, current, W2, text.id)).toEqual({
            ok: false,
            reason: "typeMismatch"
        });
    });

    it("ignores the row's own match in the wave being chosen for", () => {
        const two = copy(shortText);
        const waves = [wave(W1, [nps]), wave(W2, [two, copy(nps)])];
        // The row currently (wrongly) holds a text question for W2; choosing an
        // NPS question there replaces it, so the text question is not judged.
        const current = row([
            [W1, nps.id],
            [W2, two.id]
        ]);
        const replacement = waves[1]?.elements[1];
        if (replacement === undefined) throw new Error();
        expect(candidateVerdict(waves, current, W2, replacement.id)).toEqual({
            ok: true
        });
    });
});

describe("ComparisonDocumentSchema", () => {
    const valid = {
        name: "2025 – 2026",
        surveyIds: [W1, W2],
        rows: [
            row([
                [W1, nps.id],
                [W2, newQuestionId()]
            ])
        ]
    };

    it("accepts a well-formed document", () => {
        expect(ComparisonDocumentSchema.safeParse(valid).success).toBe(true);
    });

    it("refuses a question used in two rows", () => {
        const document = {
            ...valid,
            rows: [row([[W1, nps.id]]), row([[W1, nps.id]])]
        };
        expect(ComparisonDocumentSchema.safeParse(document).success).toBe(
            false
        );
    });

    it("refuses two questions from one wave in a row", () => {
        const document = {
            ...valid,
            rows: [
                row([
                    [W1, nps.id],
                    [W1, newQuestionId()]
                ])
            ]
        };
        expect(ComparisonDocumentSchema.safeParse(document).success).toBe(
            false
        );
    });

    it("refuses a match in a wave the comparison does not cover", () => {
        const document = { ...valid, rows: [row([[W3, nps.id]])] };
        expect(ComparisonDocumentSchema.safeParse(document).success).toBe(
            false
        );
    });

    it("refuses a wave listed twice, and more than the palette holds", () => {
        expect(
            ComparisonDocumentSchema.safeParse({
                ...valid,
                surveyIds: [W1, W1]
            }).success
        ).toBe(false);

        const six = Array.from({ length: MAX_COMPARED_WAVES + 1 }, (_, n) =>
            surveyId(`cccccccc-0000-4000-8000-00000000000${n}`)
        );
        expect(
            ComparisonDocumentSchema.safeParse({
                ...valid,
                surveyIds: six,
                rows: []
            }).success
        ).toBe(false);
    });

    it("refuses a row id used twice", () => {
        const twice = row([[W1, nps.id]]);
        expect(
            ComparisonDocumentSchema.safeParse({
                ...valid,
                rows: [twice, { ...twice, matches: [] }]
            }).success
        ).toBe(false);
    });

    it("keeps a comparison whose waves were deleted down to one", () => {
        // Deleting a survey removes it from its comparisons rather than
        // deleting them, so the stored document may hold fewer than two.
        expect(
            ComparisonDocumentSchema.safeParse({
                ...valid,
                surveyIds: [W1],
                rows: [row([[W1, nps.id]])]
            }).success
        ).toBe(true);
    });

    it("trims the name and refuses an empty one", () => {
        const parsed = ComparisonDocumentSchema.parse({
            ...valid,
            name: "  Engagement  "
        });
        expect(parsed.name).toBe("Engagement");
        expect(
            ComparisonDocumentSchema.safeParse({ ...valid, name: "   " })
                .success
        ).toBe(false);
    });
});

describe("NewComparisonSchema", () => {
    it("needs two to five waves", () => {
        const base = { name: "Series", surveyIds: [W1, W2] };
        expect(NewComparisonSchema.safeParse(base).success).toBe(true);
        expect(
            NewComparisonSchema.safeParse({ ...base, surveyIds: [W1] }).success
        ).toBe(false);
    });
});

describe("suggestMatches", () => {
    it("matches a duplicated wave question for question, by lineage", () => {
        const first = [statement, singleChoice, nps, shortText];
        const second = [
            statement,
            copy(singleChoice, { title: "Reworded role" }),
            copy(nps),
            copy(shortText)
        ];
        const waves = [wave(W1, first), wave(W2, second)];

        const rows = suggestMatches({
            waves,
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });

        expect(shape(rows)).toEqual(
            [1, 2, 3].map(index => [
                [W2, second[index]?.id],
                [W1, first[index]?.id]
            ])
        );
    });

    it("does not suggest a key match of a different type", () => {
        const replaced = copy(opinionScale, {
            key: nps.key,
            title: nps.title
        });
        const rows = suggestMatches({
            waves: [wave(W1, [nps]), wave(W2, [replaced])],
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(rows).toEqual([]);
    });

    it("falls back to identical wording for a question deleted and re-added", () => {
        // Same words, same type, a fresh key: lineage is lost, the wording is
        // not.
        const readded = copy(nps, {
            key: "question_7",
            title: "  how likely are you to RECOMMEND us "
        });
        const original = copy(nps, {
            title: "How likely are you to recommend us?"
        });
        const rows = suggestMatches({
            waves: [wave(W1, [original]), wave(W2, [readded])],
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(shape(rows)).toEqual([
            [
                [W2, readded.id],
                [W1, original.id]
            ]
        ]);
    });

    it("leaves ambiguous wording alone", () => {
        const a = copy(shortText, { key: "a", title: "Comments" });
        const b = copy(shortText, { key: "b", title: "Comments" });
        const c = copy(shortText, { key: "c", title: "Comments" });
        const rows = suggestMatches({
            waves: [wave(W1, [a, b]), wave(W2, [c])],
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(rows).toEqual([]);
    });

    it("never suggests a lone question", () => {
        const rows = suggestMatches({
            waves: [wave(W1, [nps]), wave(W2, [shortText])],
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(rows).toEqual([]);
    });

    it("never touches a question the owner has already placed", () => {
        const second = copy(nps);
        const existing = row([[W1, nps.id]]);
        // The owner deliberately left W2's NPS question out of every row by
        // removing its match; a suggestion run for W3 must not bring it back.
        const third = copy(nps);
        const rows = suggestMatches({
            waves: [wave(W1, [nps]), wave(W2, [second]), wave(W3, [third])],
            rows: [existing],
            scope: { kind: "wave", surveyId: W3 },
            newRowId: rowIds()
        });

        expect(shape(rows)).toEqual([
            [
                [W1, nps.id],
                [W3, third.id]
            ]
        ]);
    });

    it("fills only the added wave's column when a wave is added", () => {
        const two = [copy(nps), copy(shortText)];
        const three = [copy(nps), copy(shortText), copy(singleChoice)];
        const existing = [
            row([
                [W1, nps.id],
                [W2, two[0]?.id ?? newQuestionId()]
            ])
        ];

        const rows = suggestMatches({
            waves: [
                wave(W1, [nps, shortText, singleChoice]),
                wave(W2, two),
                wave(W3, three)
            ],
            rows: existing,
            scope: { kind: "wave", surveyId: W3 },
            newRowId: rowIds()
        });

        // No new rows: the text and choice questions that W1, W2 and W3 share
        // are not in any row, and adding a wave is not the moment to invent
        // them — "suggest matches" is.
        expect(shape(rows)).toEqual([
            [
                [W1, nps.id],
                [W2, two[0]?.id],
                [W3, three[0]?.id]
            ]
        ]);
    });

    it("leaves a complete row exactly as it was", () => {
        const two = copy(nps);
        const complete = row([
            [W1, nps.id],
            [W2, two.id]
        ]);
        const rows = suggestMatches({
            waves: [wave(W1, [nps]), wave(W2, [two])],
            rows: [complete],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(rows).toEqual([complete]);
    });

    it("is not fooled by a statement sharing a question's key", () => {
        const lookalike = { ...statement, key: nps.key, title: nps.title };
        const rows = suggestMatches({
            waves: [wave(W1, [nps]), wave(W2, [lookalike])],
            rows: [],
            scope: { kind: "all" },
            newRowId: rowIds()
        });
        expect(rows).toEqual([]);
    });
});

describe("pruneRows", () => {
    it("drops matches outside the comparison, then rows left empty", () => {
        const kept = row([
            [W1, nps.id],
            [W3, newQuestionId()]
        ]);
        const emptied = row([[W3, newQuestionId()]]);
        const pruned = pruneRows([kept, emptied], [W1, W2]);
        expect(shape(pruned)).toEqual([[[W1, nps.id]]]);
    });
});

describe("orderRows", () => {
    it("follows the newest wave, then the older ones", () => {
        const w1 = [copy(nps), copy(shortText), copy(singleChoice)];
        const w2 = [copy(singleChoice), copy(nps)];
        const waves = [wave(W1, w1), wave(W2, w2)];
        const id = (q: AnswerableQuestion | undefined) =>
            q?.id ?? newQuestionId();

        const onlyOld = row([[W1, id(w1[1])]]);
        const npsRow = row([
            [W1, id(w1[0])],
            [W2, id(w2[1])]
        ]);
        const choiceRow = row([
            [W1, id(w1[2])],
            [W2, id(w2[0])]
        ]);
        const gone = row([[W2, newQuestionId()]]);

        expect(
            orderRows(waves, [gone, onlyOld, npsRow, choiceRow]).map(r => r.id)
        ).toEqual([choiceRow.id, npsRow.id, onlyOld.id, gone.id]);
    });
});

describe("normalizeWording", () => {
    it("ignores case, spacing and punctuation, but not letters", () => {
        expect(normalizeWording("  Kui rahul   oled? ")).toBe(
            normalizeWording("kui rahul oled")
        );
        expect(normalizeWording("Kas töö on huvitav")).not.toBe(
            normalizeWording("Kas too on huvitav")
        );
        expect(normalizeWording("Сколько вам лет?")).toBe("сколько вам лет");
    });
});
