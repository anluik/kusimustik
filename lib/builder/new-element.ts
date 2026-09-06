import { assertNever } from "@/domain/assert-never";
import { newQuestionId } from "@/domain/ids";
import {
    OTHER_OPTION_VALUE,
    deriveQuestionKey,
    type ChoiceOption,
    type ElementType,
    type SurveyElement
} from "@/domain/question";

/**
 * Creating elements and options.
 *
 * The element types the builder can *create* are deliberately a subset of the
 * ones it can *render*: a survey may already contain any of the nine (it was
 * seeded, or duplicated from a wave built elsewhere), but the add menu only
 * offers what has a working editor. Widening `CREATABLE_ELEMENT_TYPES` is what
 * turns the next question type on, and the `assertNever` below then fails the
 * build until this factory knows how to build one. See docs/DECISIONS.md 014.
 *
 * Copy is passed in, never written here: every default title and option label
 * the owner sees comes from the message catalogue.
 */

export const CREATABLE_ELEMENT_TYPES = [
    "single_choice"
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
    /** `index` is 1-based, so the copy reads "Option 1". */
    readonly optionLabel: (index: number) => string;
};

/** How many options a new choice question starts with; the schema's minimum. */
const INITIAL_OPTION_COUNT = 2;

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

/** The keys already spoken for, so a new element cannot collide with one. */
export function takenKeys(
    elements: readonly SurveyElement[],
    except?: SurveyElement
): readonly string[] {
    return elements
        .filter(element => element.id !== except?.id)
        .map(element => element.key);
}

export function createElement(
    type: CreatableElementType,
    defaults: ElementDefaults,
    siblings: readonly SurveyElement[]
): SurveyElement {
    const base = {
        id: newQuestionId(),
        key: deriveQuestionKey(defaults.title, takenKeys(siblings)),
        title: defaults.title
    };

    switch (type) {
        case "single_choice":
            return {
                ...base,
                type: "single_choice",
                isAnswerable: true,
                required: true,
                allowOther: false,
                options: Array.from(
                    { length: INITIAL_OPTION_COUNT },
                    (_, index) => ({
                        value: `option_${index + 1}`,
                        label: defaults.optionLabel(index + 1)
                    })
                )
            };

        default:
            return assertNever(type, "creatable element type");
    }
}
