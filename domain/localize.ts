import { assertNever } from "@/domain/assert-never";
import {
    localizedText,
    resolveOptionalText,
    resolveText
} from "@/domain/content";
import type { LocalizedText, SurveyLocale } from "@/domain/content";
import type {
    AuthoredChoiceOption,
    AuthoredElement,
    ChoiceOption,
    SurveyElement
} from "@/domain/question";
import type { AuthoredSurvey, Survey } from "@/domain/survey";

/**
 * The two directions between a stored survey and the one language it is being
 * read in. Nothing else in the codebase may map between the shapes: a reader
 * that reached into a `LocalizedText` itself would be one more place to teach
 * the fallback rule to. See docs/DECISIONS.md 030.
 *
 * **Resolving** is total and lossy — every piece of text comes out as the
 * language asked for, the survey's own, or whatever the author has written, in
 * that order, and the other translations are dropped. It is what the runner,
 * the aggregator and the exporter consume.
 *
 * **Authoring** is the inverse for a surface that only knows one language: it
 * writes every string into that language and nothing into the others. It is a
 * *replacement*, not a merge, so a caller holding translations must not route
 * them through it.
 *
 * Both switch exhaustively over the union. Adding an element type, or a piece
 * of text to an existing one, breaks this file first.
 */

export function resolveSurvey(
    survey: AuthoredSurvey,
    locale: SurveyLocale = survey.locale
): Survey {
    return {
        ...survey,
        elements: resolveElements(survey.elements, locale, survey.locale)
    };
}

export function authorSurvey(
    survey: Survey,
    locale: SurveyLocale = survey.locale
): AuthoredSurvey {
    return { ...survey, elements: authorElements(survey.elements, locale) };
}

export function resolveElements(
    elements: readonly AuthoredElement[],
    locale: SurveyLocale,
    fallback: SurveyLocale = locale
): SurveyElement[] {
    return elements.map(element => resolveElement(element, locale, fallback));
}

export function authorElements(
    elements: readonly SurveyElement[],
    locale: SurveyLocale
): AuthoredElement[] {
    return elements.map(element => authorElement(element, locale));
}

export function resolveElement(
    element: AuthoredElement,
    locale: SurveyLocale,
    fallback: SurveyLocale = locale
): SurveyElement {
    const one = (value: LocalizedText) => resolveText(value, locale, fallback);
    const maybe = (value: LocalizedText | undefined) =>
        resolveOptionalText(value, locale, fallback);
    const list = (values: readonly AuthoredChoiceOption[]) =>
        values.map(({ value, label }) => ({ value, label: one(label) }));

    switch (element.type) {
        case "statement": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description))
            };
        }
        case "single_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("otherLabel", maybe(otherLabel)),
                options: list(options)
            };
        }
        case "multi_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("otherLabel", maybe(otherLabel)),
                options: list(options)
            };
        }
        case "dropdown": {
            const { title, description, options, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                options: list(options)
            };
        }
        case "short_text":
        case "long_text": {
            const { title, description, placeholder, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("placeholder", maybe(placeholder))
            };
        }
        case "opinion_scale": {
            const { title, description, minLabel, maxLabel, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("minLabel", maybe(minLabel)),
                ...optional("maxLabel", maybe(maxLabel))
            };
        }
        case "nps": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description))
            };
        }
        case "matrix_single": {
            const { title, description, rows, columns, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                rows: list(rows),
                columns: list(columns)
            };
        }
        default:
            return assertNever(element);
    }
}

export function authorElement(
    element: SurveyElement,
    locale: SurveyLocale
): AuthoredElement {
    const one = (value: string) => localizedText(locale, value);
    // An emptied optional field is *no* field, the rule `element-patch.ts`
    // follows one level down: text nobody wrote is not a translation.
    const maybe = (value: string | undefined) =>
        value === undefined || value === "" ? undefined : one(value);
    const list = (values: readonly ChoiceOption[]) =>
        values.map(({ value, label }) => ({ value, label: one(label) }));

    switch (element.type) {
        case "statement": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description))
            };
        }
        case "single_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("otherLabel", maybe(otherLabel)),
                options: list(options)
            };
        }
        case "multi_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("otherLabel", maybe(otherLabel)),
                options: list(options)
            };
        }
        case "dropdown": {
            const { title, description, options, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                options: list(options)
            };
        }
        case "short_text":
        case "long_text": {
            const { title, description, placeholder, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("placeholder", maybe(placeholder))
            };
        }
        case "opinion_scale": {
            const { title, description, minLabel, maxLabel, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                ...optional("minLabel", maybe(minLabel)),
                ...optional("maxLabel", maybe(maxLabel))
            };
        }
        case "nps": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description))
            };
        }
        case "matrix_single": {
            const { title, description, rows, columns, ...rest } = element;
            return {
                ...rest,
                title: one(title),
                ...optional("description", maybe(description)),
                rows: list(rows),
                columns: list(columns)
            };
        }
        default:
            return assertNever(element);
    }
}

/**
 * A field that is absent rather than present-and-undefined.
 *
 * `exactOptionalPropertyTypes` makes those two different documents, and the
 * stored one is JSONB: `{"description": null}` is not what an unfilled field
 * looks like.
 */
function optional<Key extends string, Value>(
    key: Key,
    value: Value | undefined
): { [K in Key]?: Value } {
    const field: { [K in Key]?: Value } = {};
    if (value !== undefined) field[key] = value;
    return field;
}
