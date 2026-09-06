import { createTranslator } from "next-intl";

import { APP_TIME_ZONE, type UiLocale } from "@/lib/i18n/locales";
import { loadRunnerMessages, type RunnerMessages } from "@/lib/i18n/messages";

/**
 * The runner's translations. Locale is a parameter, never a cookie and never a
 * URL segment: it comes from `survey.locale`. Post-MVP multilingual surveys
 * (PLAN, after-MVP item 3) can add an optional `/k/[slug]/[locale]` segment and
 * pass that value in instead, with no change to anything below this function.
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
