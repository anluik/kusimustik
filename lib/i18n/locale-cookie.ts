import "server-only";

import { hasLocale } from "next-intl";
import { cookies } from "next/headers";

import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE,
    UI_LOCALES,
    type UiLocale
} from "@/lib/i18n/locales";

/** Owner-app only. Reading this in the runner would make it dynamic. */
export async function readLocaleCookie(): Promise<UiLocale> {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;
    return hasLocale(UI_LOCALES, value) ? value : DEFAULT_LOCALE;
}
