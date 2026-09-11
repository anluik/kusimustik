import type { SurveyHead } from "@/domain/survey";
import type {
    LongTextQuestion,
    MultiChoiceQuestion,
    OpinionScaleQuestion,
    ShortTextQuestion,
    SingleChoiceQuestion,
    SurveyElement
} from "@/domain/question";

/**
 * Setting the optional fields of an element.
 *
 * An emptied optional field is *absent*, not present-and-undefined: the
 * document is stored as JSONB and read back through `SurveyElementSchema`, and
 * `exactOptionalPropertyTypes` makes the difference a type error rather than a
 * detail. Hence `delete` on a copy throughout, rather than a spread with
 * `undefined`.
 *
 * These are pure and live here rather than in the editors so that the rules
 * that pair fields together — a label whenever "other" is offered, a maximum
 * that cannot fall under its minimum — are tested without rendering anything.
 * They return `SurveyElement` because that is what the editors hand back to
 * the document; the concrete type is only needed on the way in.
 */

/** Every element has a description, and blanking it removes it. */
export function withDescription(
    element: SurveyElement,
    value: string
): SurveyElement {
    const next: SurveyElement = { ...element };
    if (value.trim() === "") delete next.description;
    else next.description = value;
    return next;
}

/**
 * The same rule for the survey's own intro, which is the same kind of optional
 * paragraph one level up. Written here rather than inlined in the header
 * block, so "emptied means absent" has one home in the builder.
 */
export function withHeadDescription(
    head: SurveyHead,
    value: string
): SurveyHead {
    const next: SurveyHead = { ...head };
    if (value.trim() === "") delete next.description;
    else next.description = value;
    return next;
}

type ChoiceWithOther = SingleChoiceQuestion | MultiChoiceQuestion;

/**
 * The schema requires a label whenever "other" is offered, so turning the
 * toggle on carries one in — the owner's previous wording if they had one, the
 * catalogue's default otherwise — and turning it off takes it away again
 * rather than leaving a stale label in the document.
 */
export function withOther(
    question: ChoiceWithOther,
    allowOther: boolean,
    defaultLabel: string
): SurveyElement {
    const next: ChoiceWithOther = { ...question, allowOther };
    if (allowOther) next.otherLabel = question.otherLabel ?? defaultLabel;
    else delete next.otherLabel;
    return next;
}

export function withOtherLabel(
    question: ChoiceWithOther,
    value: string
): SurveyElement {
    return { ...question, otherLabel: value };
}

/**
 * How many boxes a multi-choice question accepts.
 *
 * `SurveyElementSchema` rejects a minimum above the maximum and either above
 * the number of selectable options, so the panel would park the autosave on a
 * document it will not accept. Neither bound is silently rewritten, though:
 * the other end is *pulled along* so the pair stays coherent, and clamping to
 * the option count is what keeps deleting an option from stranding the save.
 */
export function withSelectionBound(
    question: MultiChoiceQuestion,
    which: "minSelections" | "maxSelections",
    value: number | undefined
): SurveyElement {
    const next: MultiChoiceQuestion = { ...question };
    if (value === undefined) {
        delete next[which];
        return next;
    }

    const selectable = question.options.length + (question.allowOther ? 1 : 0);
    const bound = Math.min(Math.max(value, 1), selectable);
    next[which] = bound;

    if (which === "minSelections" && (next.maxSelections ?? bound) < bound) {
        next.maxSelections = bound;
    }
    if (which === "maxSelections" && (next.minSelections ?? bound) > bound) {
        next.minSelections = bound;
    }
    return next;
}

/** Both bounds re-clamped after the option list changed under them. */
export function withSelectionBoundsInRange(
    question: MultiChoiceQuestion
): MultiChoiceQuestion {
    const selectable = question.options.length + (question.allowOther ? 1 : 0);
    const next: MultiChoiceQuestion = { ...question };
    for (const which of ["minSelections", "maxSelections"] as const) {
        const bound = next[which];
        if (bound !== undefined && bound > selectable) next[which] = selectable;
    }
    return next;
}

type TextQuestion = ShortTextQuestion | LongTextQuestion;

export function withMaxLength(
    question: TextQuestion,
    value: number | undefined
): SurveyElement {
    const next: TextQuestion = { ...question };
    if (value === undefined) delete next.maxLength;
    else next.maxLength = value;
    return next;
}

export function withPlaceholder(
    question: TextQuestion,
    value: string
): SurveyElement {
    const next: TextQuestion = { ...question };
    if (value.trim() === "") delete next.placeholder;
    else next.placeholder = value;
    return next;
}

export function withScaleLabel(
    question: OpinionScaleQuestion,
    which: "minLabel" | "maxLabel",
    value: string
): SurveyElement {
    const next: OpinionScaleQuestion = { ...question };
    if (value.trim() === "") delete next[which];
    else next[which] = value;
    return next;
}

/**
 * Reads a number out of an `<input type="number">`, whose value is a string
 * and is `""` while the field is empty. Empty means "no bound", which is what
 * the optional field already says, so it maps to `undefined` rather than to 0.
 */
export function readOptionalNumber(value: string): number | undefined {
    if (value.trim() === "") return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}
