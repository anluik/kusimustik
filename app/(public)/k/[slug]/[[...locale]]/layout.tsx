import "@/app/globals.css";

import { NextIntlClientProvider } from "next-intl";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { sans, mono } from "@/lib/fonts";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
    getRunnerTranslations,
    readLocaleSegment,
    requestedLocale
} from "@/lib/i18n/runner";
import { loadRunnerSurvey } from "@/lib/runner/load";
import { cn } from "@/lib/utils";

/**
 * The runner's root layout — the third of three, and the reason there is no
 * `app/layout.tsx` (docs/DECISIONS.md 011).
 *
 * It sits under the optional `[[...locale]]` segment rather than beside the
 * slug, because `<html lang>` is the language being *read* and only a root
 * layout can set it: a layout one level up would be handed the slug and not
 * the language. That is the whole reason for the optional catch-all — one
 * segment serving both `/k/<slug>` and `/k/<slug>/<locale>`, so that the two
 * share this layout instead of needing two of them. See docs/DECISIONS.md 033.
 *
 * A slug that matches nothing, or a segment that names no language, falls back
 * to the survey's own language — or to Estonian when there is no survey — and
 * renders `not-found.tsx` inside this shell.
 */
export default async function RunnerLayout({
    children,
    params
}: LayoutProps<"/k/[slug]/[[...locale]]">) {
    const { slug, locale: segments } = await params;
    const asked = requestedLocale(readLocaleSegment(segments));
    const found = await loadRunnerSurvey(slug, asked);
    const { locale, messages, timeZone } = await getRunnerTranslations(
        found?.locale ?? DEFAULT_LOCALE
    );

    return (
        <html
            lang={locale}
            className={cn(sans.variable, mono.variable)}
            suppressHydrationWarning
        >
            <body className="min-h-svh bg-survey-background font-sans text-foreground antialiased">
                <NextIntlClientProvider
                    locale={locale}
                    messages={messages}
                    timeZone={timeZone}
                >
                    {/* A respondent has no theme switch: the runner follows
                        the device. DESIGN §1 still expects both themes to be
                        correct, and next-themes sets the class before paint. */}
                    <ThemeProvider>{children}</ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
