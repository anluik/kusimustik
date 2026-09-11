import { assertNever } from "@/domain/assert-never";
import type { SurveyLocale } from "@/domain/content";
import type { QuestionId } from "@/domain/ids";
import { mergeElement, mergeHead } from "@/domain/localize";
import type { AuthoredElement, SurveyElement } from "@/domain/question";
import type { AuthoredSurveyHead, SurveyHead } from "@/domain/survey";

/**
 * The builder's document and every edit that can be made to it, as a pure
 * reducer.
 *
 * It holds the *stored* document — every language the author has written — and
 * not one language of it, because an edit made in Russian must not be able to
 * drop the Estonian it was translated from. Projecting the active language out
 * of it and merging an edit back into it is `use-survey-builder.ts`'s job; see
 * docs/DECISIONS.md 031.
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

/**
 * The survey's own head, as a thing that can be selected.
 *
 * A string sentinel rather than a wrapper object, and it cannot collide with
 * an element: a `QuestionId` is a branded uuid. Being a string is also what
 * lets the canvas keep one `[data-element-id="..."]` lookup for both.
 */
export const HEAD = "head";

export type BuilderSelection = QuestionId | typeof HEAD;

export type BuilderDocument = {
    /** The survey's title and the paragraph above the first question. */
    readonly head: AuthoredSurveyHead;
    readonly elements: readonly AuthoredElement[];
    readonly selectedId: BuilderSelection;
    readonly revision: number;
};

export type BuilderAction =
    | { readonly kind: "select"; readonly id: BuilderSelection }
    /** Appended at the end and selected, so the editor follows the owner. */
    | { readonly kind: "add"; readonly element: AuthoredElement }
    | { readonly kind: "remove"; readonly id: QuestionId }
    /** Inserted directly after its source and selected, so the copy is what
     *  the owner is now editing rather than the original. */
    | {
          readonly kind: "duplicate";
          readonly id: QuestionId;
          readonly copy: AuthoredElement;
      }
    | { readonly kind: "move"; readonly id: QuestionId; readonly to: number }
    /**
     * The editor's every keystroke: one language of an element, merged into
     * the element of the same `id`.
     *
     * The merge happens here rather than in the caller so that two edits
     * dispatched in one batch apply in turn — a caller that merged against the
     * document it last rendered would have the second silently discard the
     * first.
     */
    | {
          readonly kind: "replace";
          readonly element: SurveyElement;
          readonly locale: SurveyLocale;
      }
    /** The same, for the survey's own words. See docs/DECISIONS.md 034. */
    | {
          readonly kind: "replaceHead";
          readonly head: SurveyHead;
          readonly locale: SurveyLocale;
      };

/**
 * The head is selected, because it is the first thing in the list and the
 * first thing a respondent reads. It is also why nothing can be selected any
 * more: every survey has a head, so the editor panel always has something in
 * it and the "nothing selected" state it used to open on is gone.
 */
export function initialDocument(
    head: AuthoredSurveyHead,
    elements: readonly AuthoredElement[]
): BuilderDocument {
    return { head, elements, selectedId: HEAD, revision: 0 };
}

/**
 * Generic over the element shape, because the builder looks the selected
 * element up twice: once in the stored document and once in the one language
 * of it the editor panel is bound to.
 */
export function findElement<T extends { readonly id: QuestionId }>(
    elements: readonly T[],
    id: BuilderSelection
): T | null {
    if (id === HEAD) return null;
    return elements.find(element => element.id === id) ?? null;
}

/**
 * Moves `from` to `to`, both clamped into the array. Never mutates, and
 * returns the array it was given when nothing moves, so a caller can tell a
 * real reorder from a drag that ended where it started by identity.
 *
 * Generic because the option lists in the editor panel reorder the same way:
 * one implementation, one set of tests, one set of edge cases.
 */
export function moveItem<T>(
    items: readonly T[],
    from: number,
    to: number
): readonly T[] {
    const moved = items[from];
    if (moved === undefined) return items;

    const target = Math.min(Math.max(to, 0), items.length - 1);
    if (target === from) return items;

    const rest = items.filter((_, index) => index !== from);
    return [...rest.slice(0, target), moved, ...rest.slice(target)];
}

/**
 * What to select once `index` is gone: the element that slides into its place,
 * or the one before it when the last element was removed. Keeping the position
 * rather than the identity means a delete leaves the editor pointed at the
 * neighbour the owner is already looking at.
 */
function selectionAfterRemoval(
    remaining: readonly AuthoredElement[],
    index: number
): BuilderSelection {
    return (remaining[index] ?? remaining[index - 1])?.id ?? HEAD;
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
                ...state,
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
                ...state,
                elements,
                selectedId:
                    state.selectedId === action.id
                        ? selectionAfterRemoval(elements, index)
                        : state.selectedId,
                revision: state.revision + 1
            };
        }

        case "duplicate": {
            const index = state.elements.findIndex(
                element => element.id === action.id
            );
            if (index === -1) return state;

            return {
                ...state,
                elements: [
                    ...state.elements.slice(0, index + 1),
                    action.copy,
                    ...state.elements.slice(index + 1)
                ],
                selectedId: action.copy.id,
                revision: state.revision + 1
            };
        }

        case "move": {
            const from = state.elements.findIndex(
                element => element.id === action.id
            );
            if (from === -1) return state;

            const elements = moveItem(state.elements, from, action.to);
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
                position === index
                    ? mergeElement(element, action.element, action.locale)
                    : element
            );
            return { ...state, elements, revision: state.revision + 1 };
        }

        case "replaceHead":
            return {
                ...state,
                head: mergeHead(state.head, action.head, action.locale),
                revision: state.revision + 1
            };

        default:
            return assertNever(action, "builder action");
    }
}
