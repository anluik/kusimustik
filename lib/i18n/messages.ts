import type { UiLocale } from "@/lib/i18n/locales";

/**
 * Two catalogues, one per surface. The runner is loaded on a stranger's phone
 * over whatever connection they have, so it must not ship builder, results or
 * settings copy; see docs/DECISIONS.md 011.
 *
 * Estonian is the source of truth — the declaration in `next-intl.d.ts` is
 * derived from `app/et.json`, so a key that exists only in `en.json` is not a
 * key at all.
 */

export type AppMessages = typeof import("@/messages/app/et.json");
export type RunnerMessages = typeof import("@/messages/runner/et.json");

/**
 * Explicit loaders rather than a template literal: a static import specifier
 * per locale is what lets the bundler split the catalogues into their own
 * chunks and what makes a missing file a build error rather than a 404.
 */
const APP_CATALOGUES: Record<
    UiLocale,
    () => Promise<{ default: AppMessages }>
> = {
    et: () => import("@/messages/app/et.json"),
    en: () => import("@/messages/app/en.json"),
    ru: () => import("@/messages/app/ru.json")
};

const RUNNER_CATALOGUES: Record<
    UiLocale,
    () => Promise<{ default: RunnerMessages }>
> = {
    et: () => import("@/messages/runner/et.json"),
    en: () => import("@/messages/runner/en.json"),
    ru: () => import("@/messages/runner/ru.json")
};

export async function loadAppMessages(locale: UiLocale): Promise<AppMessages> {
    return (await APP_CATALOGUES[locale]()).default;
}

export async function loadRunnerMessages(
    locale: UiLocale
): Promise<RunnerMessages> {
    return (await RUNNER_CATALOGUES[locale]()).default;
}
