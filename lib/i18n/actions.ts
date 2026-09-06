"use server";

import { refresh } from "next/cache";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the owner's UI language. A Server Action is a public POST endpoint,
 * so the value is re-validated here even though the switcher can only produce
 * one of three.
 *
 * `httpOnly` because nothing in the browser reads it: the locale is resolved
 * server-side in `lib/i18n/request.ts`. The runner never reads this cookie —
 * doing so would make every respondent request dynamic.
 */
export async function setLocale(locale: UiLocale): Promise<void> {
    if (!hasLocale(UI_LOCALES, locale)) return;

    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    });

    refresh();
}
