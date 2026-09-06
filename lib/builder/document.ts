import { assertNever } from "@/domain/assert-never";
import type { QuestionId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";

/**
 * The builder's document and every edit that can be made to it, as a pure
 * reducer.
 *
 * The elements array is the source of truth while the builder is open: the
 * owner's edit lands here first and the autosave follows (docs/DECISIONS.md
 * 014). That is why `revision` exists — it is a monotonic counter of *saveable*
 * edits, so the autosave can tell "the document moved" from "the selection
 * moved" without diffing arrays. Selecting is not an edit and does not bump it.
 *
 * Everything in this module is pure and synchronous, so the ordering rules —
 * what stays selected after a delete, what a no-op move does — are testable
 * without rendering anything.
 */

export type BuilderDocument = {
    readonly elements: readonly SurveyElement[];
    readonly selectedId: QuestionId | null;
    readonly revision: number;
};

export type BuilderAction =
    | { readonly kind: "select"; readonly id: QuestionId | null }
    /** Appended at the end and selected, so the editor follows the owner. */
    | { readonly kind: "add"; readonly element: SurveyElement }
    | { readonly kind: "remove"; readonly id: QuestionId }
    | { readonly kind: "move"; readonly id: QuestionId; readonly to: number }
    /** Replaces the element with the same `id`; the editor's every keystroke. */
    | { readonly kind: "replace"; readonly element: SurveyElement };

/** The first element is selected, because a builder opening on nothing has
 *  nothing in its editor panel and reads as broken. */
export function initialDocument(
    elements: readonly SurveyElement[]
): BuilderDocument {
    return {
        elements,
        selectedId: elements[0]?.id ?? null,
        revision: 0
    };
}

export function findElement(
    elements: readonly SurveyElement[],
    id: QuestionId | null
): SurveyElement | null {
    if (id === null) return null;
    return elements.find(element => element.id === id) ?? null;
}

/** Moves `from` to `to`, both clamped into the array. Never mutates. */
export function moveElement(
    elements: readonly SurveyElement[],
    from: number,
    to: number
): readonly SurveyElement[] {
    const moved = elements[from];
    if (moved === undefined) return elements;

    const target = Math.min(Math.max(to, 0), elements.length - 1);
    if (target === from) return elements;

    const rest = elements.filter((_, index) => index !== from);
    return [...rest.slice(0, target), moved, ...rest.slice(target)];
}

/**
 * What to select once `index` is gone: the element that slides into its place,
 * or the one before it when the last element was removed. Keeping the position
 * rather than the identity means a delete leaves the editor pointed at the
 * neighbour the owner is already looking at.
 */
function selectionAfterRemoval(
    remaining: readonly SurveyElement[],
    index: number
): QuestionId | null {
    return (remaining[index] ?? remaining[index - 1])?.id ?? null;
}

export function documentReducer(
    state: BuilderDocument,
    action: BuilderAction
): BuilderDocument {
    switch (action.kind) {
        case "select":
            if (action.id === state.selectedId) return state;
            return { ...state, selectedId: action.id };

        case "add":
            return {
                elements: [...state.elements, action.element],
                selectedId: action.element.id,
                revision: state.revision + 1
            };

        case "remove": {
            const index = state.elements.findIndex(
                element => element.id === action.id
            );
            if (index === -1) return state;

            const elements = state.elements.filter(
                (_, position) => position !== index
            );
            return {
                elements,
                selectedId:
                    state.selectedId === action.id
                        ? selectionAfterRemoval(elements, index)
                        : state.selectedId,
                revision: state.revision + 1
            };
        }

        case "move": {
            const from = state.elements.findIndex(
                element => element.id === action.id
            );
            if (from === -1) return state;

            const elements = moveElement(state.elements, from, action.to);
            // A drag that ends where it started is not an edit, and saving it
            // would mark the survey as changed for nothing.
            if (elements === state.elements) return state;

            return { ...state, elements, revision: state.revision + 1 };
        }

        case "replace": {
            const index = state.elements.findIndex(
                element => element.id === action.element.id
            );
            if (index === -1) return state;

            const elements = state.elements.map((element, position) =>
                position === index ? action.element : element
            );
            return { ...state, elements, revision: state.revision + 1 };
        }

        default:
            return assertNever(action, "builder action");
    }
}
