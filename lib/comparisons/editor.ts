import { assertNever } from "@/domain/assert-never";
import type {
    ComparisonDocument,
    ComparisonMatch,
    ComparisonRow,
    ComparisonWave
} from "@/domain/comparison";
import {
    MAX_COMPARED_WAVES,
    pruneRows,
    suggestMatches
} from "@/domain/comparison";
import type { ComparisonRowId, QuestionId, SurveyId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { AnswerableQuestion } from "@/domain/question";

/**
 * The matching editor's document and every change the owner can make to it.
 *
 * Pure, so the rules are tested without a browser. The editor holds the whole
 * comparison and saves it whole (`saveComparisonAction`), as the builder does
 * with a survey; `revision` is what its autosave watches.
 *
 * Two choices shape what the owner sees:
 *
 * - **Rows stay where they are.** The order is set once, when the editor opens
 *   (the page passes `orderRows`' order), and edits never re-sort — a row that
 *   jumped the moment a question was chosen in it would leave the pointer on a
 *   different row.
 * - **A row emptied by hand stays on screen** until the owner removes it, so
 *   clearing one select does not make the row vanish under it. Empty rows are
 *   dropped when the comparison is saved.
 */

export type EditorState = {
    readonly document: ComparisonDocument;
    readonly revision: number;
};

export type EditorAction =
    /** Choose a wave's question for a row, or clear it with `null`. */
    | {
          readonly kind: "setMatch";
          readonly rowId: ComparisonRowId;
          readonly surveyId: SurveyId;
          readonly questionId: QuestionId | null;
      }
    /** A new row at the end, empty or already holding one question. */
    | {
          readonly kind: "addRow";
          readonly id: ComparisonRowId;
          readonly match?: ComparisonMatch;
      }
    | { readonly kind: "removeRow"; readonly rowId: ComparisonRowId }
    /** Suggest matches for every question no row holds, in the compared waves. */
    | { readonly kind: "suggest"; readonly group: readonly ComparisonWave[] }
    /** Compare one more of the group's waves, and suggest its column. */
    | {
          readonly kind: "addWave";
          readonly surveyId: SurveyId;
          /** Every wave of the group, oldest first. */
          readonly group: readonly ComparisonWave[];
      }
    | { readonly kind: "removeWave"; readonly surveyId: SurveyId };

export function initialEditorState(document: ComparisonDocument): EditorState {
    return { document, revision: 0 };
}

const withRows = (
    state: EditorState,
    rows: readonly ComparisonRow[],
    surveyIds: readonly SurveyId[] = state.document.surveyIds
): EditorState => ({
    document: { ...state.document, surveyIds: [...surveyIds], rows: [...rows] },
    revision: state.revision + 1
});

const mapRow = (
    rows: readonly ComparisonRow[],
    rowId: ComparisonRowId,
    change: (row: ComparisonRow) => ComparisonRow
): ComparisonRow[] => rows.map(row => (row.id === rowId ? change(row) : row));

/** The group's waves the comparison covers, oldest first. */
const compared = (
    group: readonly ComparisonWave[],
    surveyIds: readonly SurveyId[]
): ComparisonWave[] => group.filter(wave => surveyIds.includes(wave.surveyId));

export function editorReducer(
    state: EditorState,
    action: EditorAction
): EditorState {
    const { rows, surveyIds } = state.document;

    switch (action.kind) {
        case "setMatch": {
            const { rowId, surveyId, questionId } = action;
            const moved = rows.map(row =>
                row.id !== rowId &&
                row.matches.some(match => match.questionId === questionId)
                    ? {
                          ...row,
                          matches: row.matches.filter(
                              match => match.questionId !== questionId
                          )
                      }
                    : row
            );
            return withRows(
                state,
                mapRow(moved, rowId, row => {
                    const others = row.matches.filter(
                        match => match.surveyId !== surveyId
                    );
                    return {
                        ...row,
                        matches:
                            questionId === null
                                ? others
                                : [...others, { surveyId, questionId }]
                    };
                })
            );
        }

        case "addRow":
            return withRows(state, [
                ...rows,
                {
                    id: action.id,
                    matches: action.match === undefined ? [] : [action.match]
                }
            ]);

        case "removeRow":
            return withRows(
                state,
                rows.filter(row => row.id !== action.rowId)
            );

        case "suggest":
            return withRows(
                state,
                suggestMatches({
                    waves: compared(action.group, surveyIds),
                    rows,
                    scope: { kind: "all" }
                })
            );

        case "addWave": {
            if (
                surveyIds.includes(action.surveyId) ||
                surveyIds.length >= MAX_COMPARED_WAVES
            ) {
                return state;
            }
            const next = action.group
                .map(wave => wave.surveyId)
                .filter(id => id === action.surveyId || surveyIds.includes(id));
            return withRows(
                state,
                suggestMatches({
                    waves: compared(action.group, next),
                    rows,
                    scope: { kind: "wave", surveyId: action.surveyId }
                }),
                next
            );
        }

        case "removeWave": {
            const next = surveyIds.filter(id => id !== action.surveyId);
            return withRows(state, pruneRows(rows, next), next);
        }

        default:
            return assertNever(action, "editor action");
    }
}

/** Rows that hold nothing from at least one compared wave. */
export function incompleteRows(document: ComparisonDocument): ComparisonRow[] {
    return document.rows.filter(row =>
        document.surveyIds.some(
            surveyId => !row.matches.some(match => match.surveyId === surveyId)
        )
    );
}

export type UnmatchedWave = {
    readonly surveyId: SurveyId;
    readonly questions: readonly AnswerableQuestion[];
};

/** Per compared wave, oldest first: the questions no row holds. */
export function unmatchedQuestions(
    group: readonly ComparisonWave[],
    document: ComparisonDocument
): UnmatchedWave[] {
    const held = new Set(
        document.rows.flatMap(row => row.matches.map(match => match.questionId))
    );
    return compared(group, document.surveyIds).map(wave => ({
        surveyId: wave.surveyId,
        questions: wave.elements.filter(
            (element): element is AnswerableQuestion =>
                isAnswerableElement(element) && !held.has(element.id)
        )
    }));
}
