import type { SurveyLocale } from "@/domain/survey";

/**
 * The UI locales. Written out rather than re-exported from `domain/` so that a
 * client component can import this module without pulling the whole question
 * union and zod into the browser bundle — the `import type` above is erased.
 *
 * `lib/i18n/messages.test.ts` asserts this list is exactly `domain`'s, which is
 * the part `satisfies` cannot check: a survey written in a language the chrome
 * cannot speak would be a broken product, and Phase 6 renders the runner in
 * `survey.locale`.
 */
export const UI_LOCALES = [
    "et",
    "en",
    "ru"
] as const satisfies readonly SurveyLocale[];

export type UiLocale = (typeof UI_LOCALES)[number];

/** Estonian is the primary market; see docs/DESIGN.md §9. */
export const DEFAULT_LOCALE: UiLocale = "et";

/**
 * Owner-app locale lives in a cookie rather than the URL — see
 * docs/DECISIONS.md 011. The name is next-intl's convention.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Dates and numbers follow Estonian conventions regardless of UI language
 * (DESIGN §9), and pinning the zone keeps server and client renders identical.
 */
export const APP_TIME_ZONE = "Europe/Tallinn";
