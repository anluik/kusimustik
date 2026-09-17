import { assertNever } from "@/domain/assert-never";
import { newQuestionId } from "@/domain/ids";
import { randomToken } from "@/domain/token";
import {
    OTHER_OPTION_VALUE,
    newQuestionKey,
    type AuthoredElement,
    type ChoiceOption,
    type ElementType,
    type SurveyElement
} from "@/domain/question";

/**
 * Creating, and copying, elements.
 *
 * Every one of the nine types can now be created, so `CREATABLE_ELEMENT_TYPES`
 * is the whole union and the add menu no longer disables anything. It stays a
 * separate list rather than becoming an alias of `ELEMENT_TYPES`: a tenth type
 * has to be *taught* to this factory before the menu offers it, and the
 * `assertNever` below is what enforces that. See docs/DECISIONS.md 015.
 *
 * Copy is passed in, never written here: every default title and option label
 * the owner sees comes from the message catalogue.
 */

export const CREATABLE_ELEMENT_TYPES = [
    "statement",
    "single_choice",
    "multi_choice",
    "dropdown",
    "short_text",
    "long_text",
    "opinion_scale",
    "nps",
    "matrix_single"
] as const satisfies readonly ElementType[];

export type CreatableElementType = (typeof CREATABLE_ELEMENT_TYPES)[number];

export function isCreatableType(
    type: ElementType
): type is CreatableElementType {
    return CREATABLE_ELEMENT_TYPES.some(candidate => candidate === type);
}

/** The catalogue strings a freshly added element is filled with. */
export type ElementDefaults = {
    readonly title: string;
    /** A statement is shown, not asked, so its placeholder reads differently. */
    readonly statementTitle: string;
    /** `index` is 1-based, so the copy reads "Option 1". */
    readonly optionLabel: (index: number) => string;
    readonly rowLabel: (index: number) => string;
    readonly columnLabel: (index: number) => string;
};

/** How many options a new choice question starts with; the schema's minimum. */
const INITIAL_OPTION_COUNT = 2;
const INITIAL_MATRIX_ROWS = 2;
const INITIAL_MATRIX_COLUMNS = 3;

/**
 * The default length of a new opinion scale. Five steps is the shortest scale
 * with a neutral midpoint and clear ends, and stays readable on a phone as a
 * single row of targets — which is what the runner renders it as.
 */
const INITIAL_SCALE_MAX = 5;

/**
 * A value for a new option.
 *
 * Values are generated, never derived from the label: an answer stores the
 * value, so rewording an option must not orphan the answers already given to
 * it. For the same reason they are never *reused*. Filling the lowest free
 * `option_<n>` handed a deleted, already-answered option's value to whatever
 * was added next, and every answer the old option collected was counted under
 * the new one's label — in that survey's own results, and in every comparison
 * (docs/DECISIONS.md 035). A deleted value may still be in the answers, and
 * only the database knows, so a new value is random rather than "free".
 *
 * `taken` is still checked: a collision among a question's own options is a
 * schema error, and forty-odd bits make one a curiosity rather than a plan.
 * `OTHER_OPTION_VALUE` is excluded outright rather than by the shape of the
 * token, so changing the prefix can never make it reachable.
 */
export function nextOptionValue(taken: Iterable<string>): string {
    const used = new Set(taken);
    for (;;) {
        const candidate = `o_${randomToken(OPTION_VALUE_TOKEN_LENGTH)}`;
        if (!used.has(candidate) && candidate !== OTHER_OPTION_VALUE) {
            return candidate;
        }
    }
}

const OPTION_VALUE_TOKEN_LENGTH = 10;

export function newOption(
    existing: readonly ChoiceOption[],
    label: (index: number) => string
): ChoiceOption {
    return {
        value: nextOptionValue(existing.map(option => option.value)),
        label: label(existing.length + 1)
    };
}

/** A fresh run of options, values `option_1`… and labels from the catalogue. */
function newOptions(
    count: number,
    label: (index: number) => string
): ChoiceOption[] {
    return Array.from({ length: count }, (_, index) => ({
        value: `option_${index + 1}`,
        label: label(index + 1)
    }));
}

/**
 * A new element, in one language.
 *
 * The caller authors it into the survey's own: structure belongs to the
 * language the survey is written in, so a question added while translating
 * appears in the translation as one more thing left to translate rather than
 * as a question the source language is missing.
 */
export function createElement(
    type: CreatableElementType,
    defaults: ElementDefaults,
    siblings: readonly { readonly key: string }[]
): SurveyElement {
    const taken = siblings.map(sibling => sibling.key);
    const question = {
        id: newQuestionId(),
        key: newQuestionKey(taken),
        title: defaults.title,
        isAnswerable: true,
        required: true
    } as const;

    switch (type) {
        case "statement":
            return {
                id: newQuestionId(),
                key: newQuestionKey(taken),
                title: defaults.statementTitle,
                type: "statement",
                isAnswerable: false
            };

        case "single_choice":
            return {
                ...question,
                type: "single_choice",
                allowOther: false,
                options: newOptions(INITIAL_OPTION_COUNT, defaults.optionLabel)
            };

        case "multi_choice":
            return {
                ...question,
                type: "multi_choice",
                allowOther: false,
                options: newOptions(INITIAL_OPTION_COUNT, defaults.optionLabel)
            };

        case "dropdown":
            return {
                ...question,
                type: "dropdown",
                options: newOptions(INITIAL_OPTION_COUNT, defaults.optionLabel)
            };

        // The two written-answer types start optional. A required open-ended
        // question is the single most reliable way to lose a respondent — it
        // cannot be answered by tapping, and on a phone it is where a survey
        // is abandoned. The author can still make it required; the default is
        // the one that does not cost them responses.
        case "short_text":
            return { ...question, type: "short_text", required: false };

        case "long_text":
            return { ...question, type: "long_text", required: false };

        case "opinion_scale":
            return {
                ...question,
                type: "opinion_scale",
                max: INITIAL_SCALE_MAX
            };

        case "nps":
            return { ...question, type: "nps" };

        case "matrix_single":
            return {
                ...question,
                type: "matrix_single",
                rows: newOptions(INITIAL_MATRIX_ROWS, defaults.rowLabel),
                columns: newOptions(
                    INITIAL_MATRIX_COLUMNS,
                    defaults.columnLabel
                )
            };

        default:
            return assertNever(type, "creatable element type");
    }
}

/**
 * A copy of an element, ready to sit next to the original.
 *
 * The copy gets a fresh `id` and a fresh `key`. That is the opposite of
 * `duplicateSurvey`, which preserves keys so that a wave's questions carry
 * their lineage into the next one (docs/DECISIONS.md 035) — here the two
 * questions live in the *same* survey, where a shared key is a `SurveySchema`
 * violation, and the copy is a new question that merely starts out alike.
 * Everything the author wrote — options, bounds, labels, every language — is
 * carried over verbatim.
 */
export function duplicateElement(
    element: AuthoredElement,
    siblings: readonly { readonly key: string }[]
): AuthoredElement {
    return {
        ...element,
        id: newQuestionId(),
        key: newQuestionKey(siblings.map(sibling => sibling.key))
    };
}
