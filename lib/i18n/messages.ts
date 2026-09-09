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

/**
 * The words a new element is born with, in every language a survey may be
 * written in.
 *
 * These are the one part of the owner app's catalogue that is *not* chrome:
 * "Uus küsimus", "Valik 1" and the "other" label are seeds for the survey
 * document, so they belong to the language the survey is being written in and
 * not to the language its author happens to be reading the app in. The whole
 * subtree is six short strings, so all three languages are loaded at once and
 * handed to the builder, which picks per keystroke — see
 * `lib/builder/element-copy.ts` and docs/DECISIONS.md 032.
 */
export type ElementCopyMessages = Record<
    UiLocale,
    AppMessages["Builder"]["defaults"]
>;

export async function loadElementCopyMessages(): Promise<ElementCopyMessages> {
    // Written out rather than mapped over `UI_LOCALES`, so that the record is
    // complete by construction: a fourth language is a type error here rather
    // than a `Record` assembled with a cast and missing a key at runtime.
    const [et, en, ru] = await Promise.all([
        loadAppMessages("et"),
        loadAppMessages("en"),
        loadAppMessages("ru")
    ]);
    return {
        et: et.Builder.defaults,
        en: en.Builder.defaults,
        ru: ru.Builder.defaults
    };
}
