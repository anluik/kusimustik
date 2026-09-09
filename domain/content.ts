import { z } from "zod";

/**
 * Author-written text, in every language the survey has been written in.
 *
 * A survey's `elements` document carries no bare strings where a respondent
 * will read one: every title, description, choice label, "other" label, scale
 * endpoint and matrix row or column heading is a map from locale to text. One
 * language is the normal case and three is the reason this exists — see
 * docs/DECISIONS.md 030.
 *
 * The map is partial on purpose. An author who has written a question in
 * Estonian and not yet in Russian has an Estonian entry and no Russian one,
 * and `resolveText` falls back rather than rendering a blank. What is *not*
 * permitted is an empty map: text nobody can read is not a translation state,
 * it is a broken document.
 *
 * Identifiers are deliberately not in here. A question `key`, a choice
 * `value`, a slug and an element `id` are machine-facing, join on themselves
 * across waves and languages, and never change when a translation is added.
 */

export const LOCALES = ["et", "en", "ru"] as const;
export type SurveyLocale = (typeof LOCALES)[number];

/**
 * Text in one or more languages, at most `maxLength` characters each.
 *
 * The limits mirror the plain-string ones they replaced, per language rather
 * than in total: a translation is a different sentence, not a longer one.
 */
export function localizedTextSchema(maxLength: number) {
    return z
        .partialRecord(z.literal(LOCALES), z.string().min(1).max(maxLength))
        .check(ctx => {
            if (Object.keys(ctx.value).length === 0) {
                ctx.issues.push({
                    code: "custom",
                    input: ctx.value,
                    message: "needs text in at least one language"
                });
            }
        });
}

export type LocalizedText = z.infer<ReturnType<typeof localizedTextSchema>>;

/** Text an author has written in exactly one language. */
export function localizedText(
    locale: SurveyLocale,
    value: string
): LocalizedText {
    const text: LocalizedText = {};
    text[locale] = value;
    return text;
}

/**
 * The one language to show, with the fallback that keeps a half-translated
 * survey readable: the language asked for, then the survey's own, then
 * whatever the author has actually written.
 *
 * Total by construction — the schema guarantees at least one entry — but it
 * still answers an empty map with an empty string rather than throwing. This
 * runs inside the respondent's page, and a document that got past the parser
 * in a state the parser rejects is not worth blanking a survey over.
 */
export function resolveText(
    text: LocalizedText,
    locale: SurveyLocale,
    fallback: SurveyLocale
): string {
    return text[locale] ?? text[fallback] ?? firstWritten(text);
}

/** As `resolveText`, for a field the author may simply not have filled in. */
export function resolveOptionalText(
    text: LocalizedText | undefined,
    locale: SurveyLocale,
    fallback: SurveyLocale
): string | undefined {
    return text === undefined ? undefined : resolveText(text, locale, fallback);
}

/** The languages this text has been written in, in `LOCALES` order. */
export function writtenLocales(text: LocalizedText): readonly SurveyLocale[] {
    return LOCALES.filter(locale => text[locale] !== undefined);
}

function firstWritten(text: LocalizedText): string {
    for (const locale of LOCALES) {
        const value = text[locale];
        if (value !== undefined) return value;
    }
    return "";
}
