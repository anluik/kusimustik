import { getRequestConfig } from "next-intl/server";

import { APP_TIME_ZONE } from "@/lib/i18n/locales";
import { loadAppMessages } from "@/lib/i18n/messages";
import { readLocaleCookie } from "@/lib/i18n/locale-cookie";

/**
 * The owner app's request configuration. Locale comes from the cookie the
 * sidebar switcher writes, never from the URL: a results link forwarded to a
 * colleague should render in *their* language, not the sender's.
 *
 * The public runner does not go through here — it is rendered in the survey's
 * own locale via `lib/i18n/runner.ts`, which takes the locale as an argument
 * and reads no cookie, so the page stays cacheable. See docs/DECISIONS.md 011.
 */
export default getRequestConfig(async () => {
    const locale = await readLocaleCookie();
    return {
        locale,
        messages: await loadAppMessages(locale),
        timeZone: APP_TIME_ZONE
    };
});
