import { describe, expect, it } from "vitest";

import type {
    ComparisonDocument,
    ComparisonRow,
    ComparisonWave
} from "@/domain/comparison";
import { MAX_COMPARED_WAVES } from "@/domain/comparison";
import type { QuestionId, SurveyId } from "@/domain/ids";
import { newComparisonRowId, newQuestionId, surveyId } from "@/domain/ids";
import type { AnswerableQuestion } from "@/domain/question";
import { nps, shortText } from "@/domain/test-fixtures";
import {
    editorReducer,
    incompleteRows,
    initialEditorState,
    unmatchedQuestions
} from "@/lib/comparisons/editor";
import type { EditorState } from "@/lib/comparisons/editor";

const W = Array.from({ length: 7 }, (_, n) =>
    surveyId(`aaaaaaaa-0000-4000-8000-00000000000${n}`)
);
const [W1, W2, W3] = [W[0]!, W[1]!, W[2]!];

const copy = <Q extends AnswerableQuestion>(question: Q): Q => ({
    ...question,
    id: newQuestionId()
});

const q = {
    one: { nps: copy(nps), text: copy(shortText) },
    two: { nps: copy(nps), text: copy(shortText) },
    three: { nps: copy(nps), text: copy(shortText) }
};

const GROUP: readonly ComparisonWave[] = [
    { surveyId: W1, elements: [q.one.nps, q.one.text] },
    { surveyId: W2, elements: [q.two.nps, q.two.text] },
    { surveyId: W3, elements: [q.three.nps, q.three.text] }
];

function row(matches: readonly [SurveyId, QuestionId][]): ComparisonRow {
    return {
        id: newComparisonRowId(),
        matches: matches.map(([s, id]) => ({ surveyId: s, questionId: id }))
    };
}

function state(
    rows: readonly ComparisonRow[],
    surveyIds: readonly SurveyId[] = [W1, W2]
): EditorState {
    const document: ComparisonDocument = {
        name: "Test",
        surveyIds: [...surveyIds],
        rows: [...rows]
    };
    return initialEditorState(document);
}

const matchesOf = (s: EditorState) =>
    s.document.rows.map(r => r.matches.map(m => m.questionId));

describe("editorReducer", () => {
    it("counts every change as a revision", () => {
        const before = state([row([[W1, q.one.nps.id]])]);
        const after = editorReducer(before, {
            kind: "addRow",
            id: newComparisonRowId()
        });
        expect(after.revision).toBe(before.revision + 1);
    });

    describe("setMatch", () => {
        it("sets a wave's question", () => {
            const r = row([[W1, q.one.nps.id]]);
            const next = editorReducer(state([r]), {
                kind: "setMatch",
                rowId: r.id,
                surveyId: W2,
                questionId: q.two.nps.id
            });
            expect(matchesOf(next)).toEqual([[q.one.nps.id, q.two.nps.id]]);
        });

        it("replaces the row's question in that wave", () => {
            const r = row([
                [W1, q.one.nps.id],
                [W2, q.two.text.id]
            ]);
            const next = editorReducer(state([r]), {
                kind: "setMatch",
                rowId: r.id,
                surveyId: W2,
                questionId: q.two.nps.id
            });
            expect(matchesOf(next)).toEqual([[q.one.nps.id, q.two.nps.id]]);
        });

        it("moves a question out of the row that held it", () => {
            const holder = row([
                [W1, q.one.text.id],
                [W2, q.two.nps.id]
            ]);
            const target = row([[W1, q.one.nps.id]]);
            const next = editorReducer(state([holder, target]), {
                kind: "setMatch",
                rowId: target.id,
                surveyId: W2,
                questionId: q.two.nps.id
            });
            expect(matchesOf(next)).toEqual([
                [q.one.text.id],
                [q.one.nps.id, q.two.nps.id]
            ]);
        });

        it("clears a wave, keeping the row on screen", () => {
            const r = row([[W1, q.one.nps.id]]);
            const next = editorReducer(state([r]), {
                kind: "setMatch",
                rowId: r.id,
                surveyId: W1,
                questionId: null
            });
            expect(next.document.rows).toHaveLength(1);
            expect(matchesOf(next)).toEqual([[]]);
        });
    });

    it("adds a row, empty or seeded with one question", () => {
        const empty = editorReducer(state([]), {
            kind: "addRow",
            id: newComparisonRowId()
        });
        expect(matchesOf(empty)).toEqual([[]]);

        const seeded = editorReducer(empty, {
            kind: "addRow",
            id: newComparisonRowId(),
            match: { surveyId: W2, questionId: q.two.text.id }
        });
        expect(matchesOf(seeded)).toEqual([[], [q.two.text.id]]);
    });

    it("removes a row", () => {
        const kept = row([[W1, q.one.nps.id]]);
        const gone = row([[W1, q.one.text.id]]);
        const next = editorReducer(state([kept, gone]), {
            kind: "removeRow",
            rowId: gone.id
        });
        expect(next.document.rows.map(r => r.id)).toEqual([kept.id]);
    });

    it("suggests across the compared waves only", () => {
        const next = editorReducer(state([]), {
            kind: "suggest",
            group: GROUP
        });
        // Two rows, W1 and W2 only: W3 is in the group but not compared.
        expect(matchesOf(next)).toEqual([
            [q.two.nps.id, q.one.nps.id],
            [q.two.text.id, q.one.text.id]
        ]);
    });

    it("adds a wave in age order and fills only its column", () => {
        const existing = row([
            [W2, q.two.nps.id],
            [W3, q.three.nps.id]
        ]);
        const next = editorReducer(state([existing], [W2, W3]), {
            kind: "addWave",
            surveyId: W1,
            group: GROUP
        });
        expect(next.document.surveyIds).toEqual([W1, W2, W3]);
        expect(matchesOf(next)).toEqual([
            [q.two.nps.id, q.three.nps.id, q.one.nps.id]
        ]);
    });

    it("will not add a wave past the palette", () => {
        const five = W.slice(0, MAX_COMPARED_WAVES);
        const before = state([], five);
        const after = editorReducer(before, {
            kind: "addWave",
            surveyId: W[MAX_COMPARED_WAVES]!,
            group: []
        });
        expect(after).toBe(before);
    });

    it("removes a wave with its matches, and the rows it empties", () => {
        const both = row([
            [W1, q.one.nps.id],
            [W2, q.two.nps.id]
        ]);
        const onlyTwo = row([[W2, q.two.text.id]]);
        const next = editorReducer(state([both, onlyTwo]), {
            kind: "removeWave",
            surveyId: W2
        });
        expect(next.document.surveyIds).toEqual([W1]);
        expect(matchesOf(next)).toEqual([[q.one.nps.id]]);
    });
});

describe("the editor's views", () => {
    it("lists, per compared wave, the questions no row holds", () => {
        const s = state([row([[W1, q.one.nps.id]])]);
        expect(
            unmatchedQuestions(GROUP, s.document).map(entry => [
                entry.surveyId,
                entry.questions.map(question => question.id)
            ])
        ).toEqual([
            [W1, [q.one.text.id]],
            [W2, [q.two.nps.id, q.two.text.id]]
        ]);
    });

    it("finds the rows missing a compared wave", () => {
        const complete = row([
            [W1, q.one.nps.id],
            [W2, q.two.nps.id]
        ]);
        const partial = row([[W1, q.one.text.id]]);
        expect(
            incompleteRows(state([complete, partial]).document).map(r => r.id)
        ).toEqual([partial.id]);
    });
});
