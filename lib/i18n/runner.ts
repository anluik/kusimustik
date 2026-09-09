import { createTranslator, hasLocale } from "next-intl";

import { APP_TIME_ZONE, UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";
import { loadRunnerMessages, type RunnerMessages } from "@/lib/i18n/messages";

/**
 * The runner's translations. Locale is a parameter and never a cookie: it is
 * the language the survey is being *read* in — its own by default, or the one
 * the respondent picked, which arrives as the `[[...locale]]` segment below.
 *
 * DECISIONS 011 wrote that this seam would be opened "with no change to
 * anything below this function", and Phase 12 step 3 opened it exactly there:
 * the chrome and the questions speak one language because both are given the
 * same value. Reading a cookie here would still be wrong — it would make every
 * respondent request dynamic, which is why the picker is a set of links to
 * distinct URLs rather than a control that writes a preference.
 *
 * Server components call this; client components below them get the same
 * messages through `NextIntlClientProvider` with explicit `locale`, `messages`
 * and `timeZone` props, which is why the runner never touches
 * `lib/i18n/request.ts`.
 */
export async function getRunnerTranslations(locale: UiLocale) {
    const messages = await loadRunnerMessages(locale);
    return {
        locale,
        messages,
        timeZone: APP_TIME_ZONE,
        t: createTranslator<RunnerMessages>({
            locale,
            messages,
            timeZone: APP_TIME_ZONE
        })
    };
}

/**
 * What the `[[...locale]]` segment of a runner URL asks for.
 *
 * `undefined` is the bare `/k/<slug>` — the share link, which carries no
 * language and renders the one the survey is written in. `"unknown"` is a
 * segment that names no language at all; nothing can render it, and the page
 * turns it into a 404 rather than guessing.
 *
 * A language the survey is not *offered* in is neither of those: it is a
 * well-formed request the survey cannot answer, and `getRunnerSurveyBySlug`
 * is what decides that, because only the row knows which languages are on
 * offer. See docs/DECISIONS.md 033.
 */
export type RunnerLocaleSegment = UiLocale | "unknown" | undefined;

export function readLocaleSegment(
    segments: readonly string[] | undefined
): RunnerLocaleSegment {
    if (segments === undefined || segments.length === 0) return undefined;
    // `/k/<slug>/et/extra` is not a deeper page, it is junk: the segment is
    // exactly one language or it is nothing.
    if (segments.length > 1) return "unknown";
    const [only] = segments;
    return only !== undefined && hasLocale(UI_LOCALES, only) ? only : "unknown";
}

/** The same, as the optional argument the runner's read takes. */
export function requestedLocale(
    segment: RunnerLocaleSegment
): UiLocale | undefined {
    return segment === "unknown" ? undefined : segment;
}
