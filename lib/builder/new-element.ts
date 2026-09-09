import { assertNever } from "@/domain/assert-never";
import type { SurveyLocale } from "@/domain/content";
import type { QuestionId } from "@/domain/ids";
import { newQuestionId } from "@/domain/ids";
import { resolveElement } from "@/domain/localize";
import { takenKeys, type SurveyKeys } from "@/lib/builder/keys";
import {
    OTHER_OPTION_VALUE,
    deriveQuestionKey,
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
 * it. `OTHER_OPTION_VALUE` is reserved by the schema and cannot be produced
 * here, since every candidate is `option_<n>`.
 */
export function nextOptionValue(taken: Iterable<string>): string {
    const used = new Set(taken);
    for (let n = 1; ; n += 1) {
        const candidate = `option_${n}`;
        if (!used.has(candidate) && candidate !== OTHER_OPTION_VALUE) {
            return candidate;
        }
    }
}

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
    siblings: readonly { readonly id: QuestionId; readonly key: string }[],
    keys: SurveyKeys
): SurveyElement {
    const taken = takenKeys(siblings, keys);
    const question = {
        id: newQuestionId(),
        key: deriveQuestionKey(defaults.title, taken),
        title: defaults.title,
        isAnswerable: true,
        required: true
    } as const;

    switch (type) {
        case "statement":
            return {
                id: newQuestionId(),
                key: deriveQuestionKey(defaults.statementTitle, taken),
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
 * `duplicateSurvey`, which preserves keys so that waves stay comparable
 * (docs/DECISIONS.md 003) — here the two questions live in the *same* survey,
 * where a shared key is a `SurveySchema` violation and would mean two CSV
 * columns claiming one header. Everything the author wrote — options, bounds,
 * labels — is carried over verbatim.
 *
 * It copies the *stored* element, so a question translated into three
 * languages is duplicated in three. Only the key is derived from one language,
 * and it is the survey's own: a key is machine-facing, and deriving it from
 * whichever language the author happened to be translating in would name the
 * CSV column in Russian.
 */
export function duplicateElement(
    element: AuthoredElement,
    source: SurveyLocale,
    siblings: readonly AuthoredElement[],
    keys: SurveyKeys
): AuthoredElement {
    return {
        ...element,
        id: newQuestionId(),
        key: deriveQuestionKey(
            resolveElement(element, source).title,
            takenKeys(siblings, keys)
        )
    };
}
