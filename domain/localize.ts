import { assertNever } from "@/domain/assert-never";
import {
    isEmptyText,
    localizedText,
    resolveOptionalText,
    resolveText,
    withLocale
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
 * The two directions between a stored survey and one language of it. Nothing
 * else in the codebase may map between the shapes: a reader that reached into
 * a `LocalizedText` itself would be one more place to teach the fallback rule
 * to. See docs/DECISIONS.md 030.
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
 * The builder needs two more (docs/DECISIONS.md 031), and they are the reason
 * this file is written the way it is. **Projecting** is resolving with the
 * fallback switched off, so an untranslated field arrives blank and the author
 * can see what is missing rather than the language they are translating *from*.
 * **Merging** is authoring one language into a document that already has
 * others, which is the only write that must not lose a translation.
 *
 * All four are one exhaustive switch per direction — `mapToResolved` and
 * `mapToAuthored` below — with the per-field behaviour passed in. Four hand
 * written switches over the same nine variants is four places to forget a
 * field; DECISIONS 030 already named that as the failure mode this file
 * exists to prevent, so the switches stay singular and everything else is a
 * reader.
 */

// --- Where an element's words live ------------------------------------------

/** The scalar text fields; not every element has all of them. */
type ScalarPath =
    | "title"
    | "description"
    | "otherLabel"
    | "placeholder"
    | "minLabel"
    | "maxLabel";

/** The three lists of choices, whose labels are addressed by option value. */
export type ChoiceList = "options" | "rows" | "columns";

/**
 * One piece of text within an element.
 *
 * A list's labels are keyed by the option's *value* rather than its position,
 * for the reason values exist at all: reordering a list, or inserting into it,
 * must not move a translation from one choice to another.
 */
export type TextPath = ScalarPath | `${ChoiceList}:${string}`;

/** The path of one label in one of an element's three lists of choices. */
export const choicePath = (list: ChoiceList, value: string): TextPath =>
    `${list}:${value}`;

/** How to turn each stored `LocalizedText` into the one string a reader gets. */
type AuthoredReader = {
    readonly one: (path: TextPath, text: LocalizedText) => string;
    readonly maybe: (
        path: TextPath,
        text: LocalizedText | undefined
    ) => string | undefined;
};

/** How to turn each edited string back into stored, locale-keyed text. */
type ResolvedReader = {
    readonly one: (path: TextPath, value: string) => LocalizedText;
    readonly maybe: (
        path: TextPath,
        value: string | undefined
    ) => LocalizedText | undefined;
};

// --- The two switches -------------------------------------------------------

/**
 * A stored element, with every piece of its text read through `text`.
 *
 * This and `mapToAuthored` are the only places that know which of an element's
 * fields are words. Adding an element type, or a piece of text to an existing
 * one, breaks this file first.
 */
function mapToResolved(
    element: AuthoredElement,
    text: AuthoredReader
): SurveyElement {
    const one = (path: TextPath, value: LocalizedText) => text.one(path, value);
    const maybe = (path: TextPath, value: LocalizedText | undefined) =>
        text.maybe(path, value);
    const list = (
        name: ChoiceList,
        values: readonly AuthoredChoiceOption[]
    ): ChoiceOption[] =>
        values.map(({ value, label }) => ({
            value,
            label: one(choicePath(name, value), label)
        }));

    switch (element.type) {
        case "statement": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description))
            };
        }
        case "single_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("otherLabel", maybe("otherLabel", otherLabel)),
                options: list("options", options)
            };
        }
        case "multi_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("otherLabel", maybe("otherLabel", otherLabel)),
                options: list("options", options)
            };
        }
        case "dropdown": {
            const { title, description, options, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                options: list("options", options)
            };
        }
        case "short_text":
        case "long_text": {
            const { title, description, placeholder, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("placeholder", maybe("placeholder", placeholder))
            };
        }
        case "opinion_scale": {
            const { title, description, minLabel, maxLabel, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("minLabel", maybe("minLabel", minLabel)),
                ...optional("maxLabel", maybe("maxLabel", maxLabel))
            };
        }
        case "nps": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description))
            };
        }
        case "matrix_single": {
            const { title, description, rows, columns, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                rows: list("rows", rows),
                columns: list("columns", columns)
            };
        }
        default:
            return assertNever(element);
    }
}

/** An element in one language, with every string written back through `text`. */
function mapToAuthored(
    element: SurveyElement,
    text: ResolvedReader
): AuthoredElement {
    const one = (path: TextPath, value: string) => text.one(path, value);
    const maybe = (path: TextPath, value: string | undefined) =>
        text.maybe(path, value);
    const list = (
        name: ChoiceList,
        values: readonly ChoiceOption[]
    ): AuthoredChoiceOption[] =>
        values.map(({ value, label }) => ({
            value,
            label: one(choicePath(name, value), label)
        }));

    switch (element.type) {
        case "statement": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description))
            };
        }
        case "single_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("otherLabel", maybe("otherLabel", otherLabel)),
                options: list("options", options)
            };
        }
        case "multi_choice": {
            const { title, description, otherLabel, options, ...rest } =
                element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("otherLabel", maybe("otherLabel", otherLabel)),
                options: list("options", options)
            };
        }
        case "dropdown": {
            const { title, description, options, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                options: list("options", options)
            };
        }
        case "short_text":
        case "long_text": {
            const { title, description, placeholder, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("placeholder", maybe("placeholder", placeholder))
            };
        }
        case "opinion_scale": {
            const { title, description, minLabel, maxLabel, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                ...optional("minLabel", maybe("minLabel", minLabel)),
                ...optional("maxLabel", maybe("maxLabel", maxLabel))
            };
        }
        case "nps": {
            const { title, description, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description))
            };
        }
        case "matrix_single": {
            const { title, description, rows, columns, ...rest } = element;
            return {
                ...rest,
                title: one("title", title),
                ...optional("description", maybe("description", description)),
                rows: list("rows", rows),
                columns: list("columns", columns)
            };
        }
        default:
            return assertNever(element);
    }
}

// --- Resolving --------------------------------------------------------------

export function resolveSurvey(
    survey: AuthoredSurvey,
    locale: SurveyLocale = survey.locale
): Survey {
    return {
        ...survey,
        elements: resolveElements(survey.elements, locale, survey.locale)
    };
}

export function resolveElements(
    elements: readonly AuthoredElement[],
    locale: SurveyLocale,
    fallback: SurveyLocale = locale
): SurveyElement[] {
    return elements.map(element => resolveElement(element, locale, fallback));
}

export function resolveElement(
    element: AuthoredElement,
    locale: SurveyLocale,
    fallback: SurveyLocale = locale
): SurveyElement {
    return mapToResolved(element, {
        one: (_path, text) => resolveText(text, locale, fallback),
        maybe: (_path, text) => resolveOptionalText(text, locale, fallback)
    });
}

// --- Authoring --------------------------------------------------------------

export function authorSurvey(
    survey: Survey,
    locale: SurveyLocale = survey.locale
): AuthoredSurvey {
    return { ...survey, elements: authorElements(survey.elements, locale) };
}

export function authorElements(
    elements: readonly SurveyElement[],
    locale: SurveyLocale
): AuthoredElement[] {
    return elements.map(element => authorElement(element, locale));
}

export function authorElement(
    element: SurveyElement,
    locale: SurveyLocale
): AuthoredElement {
    return mapToAuthored(element, {
        one: (_path, value) => localizedText(locale, value),
        // An emptied optional field is *no* field, the rule `element-patch.ts`
        // follows one level down: text nobody wrote is not a translation.
        maybe: (_path, value) =>
            value === undefined || value.trim() === ""
                ? undefined
                : localizedText(locale, value)
    });
}

// --- Projecting and merging: the builder's pair ------------------------------

/**
 * The element as the author has written it *in this language only*.
 *
 * Resolving with the fallback switched off. An untranslated title comes back
 * as an empty string and an untranslated optional field comes back absent, so
 * the editor panel shows a blank waiting to be filled rather than the language
 * being translated from — which, typed over, would be filed as a translation
 * of itself. The reference text belongs in the placeholder instead; see
 * `referenceTexts`.
 *
 * The result is deliberately *not* a document `SurveyElementSchema` accepts: a
 * blank title is what "not translated yet" looks like. Nothing parses it — the
 * builder validates the stored shape, where the other languages are still
 * there.
 */
export function projectElement(
    element: AuthoredElement,
    locale: SurveyLocale
): SurveyElement {
    return mapToResolved(element, {
        one: (_path, text) => text[locale] ?? "",
        maybe: (_path, text) => text?.[locale]
    });
}

export function projectElements(
    elements: readonly AuthoredElement[],
    locale: SurveyLocale
): SurveyElement[] {
    return elements.map(element => projectElement(element, locale));
}

/**
 * `edited`, which is one language of `stored`, written back into it.
 *
 * The edited element is authoritative for everything that is not words — its
 * options, its bounds, its key — and for the text *of this language only*.
 * Every other translation is carried across from `stored`, matched by field
 * and, inside a list, by option value. Emptying a field removes this
 * language's entry and leaves the rest, so clearing a Russian label is not a
 * Russian label of nothing.
 *
 * An option the edit added has no counterpart to merge with and simply arrives
 * in the language it was typed in. An option the edit removed takes all its
 * translations with it: a choice nobody is offered has no words worth keeping.
 */
export function mergeElement(
    stored: AuthoredElement,
    edited: SurveyElement,
    locale: SurveyLocale
): AuthoredElement {
    const texts = elementTexts(stored);

    return mapToAuthored(edited, {
        one: (path, value) => withLocale(texts.get(path), locale, value),
        maybe: (path, value) => {
            const merged = withLocale(texts.get(path), locale, value ?? "");
            return isEmptyText(merged) ? undefined : merged;
        }
    });
}

export function mergeElements(
    stored: readonly AuthoredElement[],
    edited: readonly SurveyElement[],
    locale: SurveyLocale
): AuthoredElement[] {
    const by = new Map(stored.map(element => [element.id, element]));
    return edited.map(element => {
        const source = by.get(element.id);
        return source === undefined
            ? authorElement(element, locale)
            : mergeElement(source, element, locale);
    });
}

// --- What the author has and has not written --------------------------------

/**
 * Every piece of text in an element, addressed by path.
 *
 * Collected by running the resolving switch and keeping what it asks for,
 * rather than by a third switch that could disagree with it: the set of paths
 * an element has is exactly the set `mapToResolved` reads, by construction.
 * The element it builds along the way is discarded.
 */
export function elementTexts(
    element: AuthoredElement
): ReadonlyMap<TextPath, LocalizedText> {
    const texts = new Map<TextPath, LocalizedText>();
    mapToResolved(element, {
        one: (path, text) => {
            texts.set(path, text);
            return "";
        },
        maybe: (path, text) => {
            if (text !== undefined) texts.set(path, text);
            return undefined;
        }
    });
    return texts;
}

/**
 * What each of an element's fields says today, for a reader in `locale`.
 *
 * The builder shows these as placeholders while translating: the author sees
 * the sentence they are translating *from* in grey behind an empty field,
 * which is the whole of the "without the editor panel doubling in size"
 * requirement in PLAN Phase 12.
 */
export function referenceTexts(
    element: AuthoredElement,
    locale: SurveyLocale,
    fallback: SurveyLocale
): ReadonlyMap<TextPath, string> {
    return new Map(
        [...elementTexts(element)].map(([path, text]) => [
            path,
            resolveText(text, locale, fallback)
        ])
    );
}

/** How many of an element's fields have no text in `locale`. */
export function missingTranslations(
    element: AuthoredElement,
    locale: SurveyLocale
): number {
    let missing = 0;
    for (const text of elementTexts(element).values()) {
        if (text[locale] === undefined) missing += 1;
    }
    return missing;
}

/** The same, over a whole document. */
export function missingTranslationCount(
    elements: readonly AuthoredElement[],
    locale: SurveyLocale
): number {
    return elements.reduce(
        (total, element) => total + missingTranslations(element, locale),
        0
    );
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
