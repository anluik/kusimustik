import "@/app/globals.css";

import { NextIntlClientProvider } from "next-intl";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { sans, mono } from "@/lib/fonts";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getRunnerTranslations } from "@/lib/i18n/runner";
import { loadRunnerSurvey } from "@/lib/runner/load";
import { cn } from "@/lib/utils";

/**
 * The runner's root layout — the third of three, and the reason there is no
 * `app/layout.tsx` (docs/DECISIONS.md 011). `lang` comes from `survey.locale`,
 * not from a cookie and not from the URL, so it is resolved here where the
 * slug is: only a root layout can set `<html lang>`, and only this segment
 * knows which survey is being rendered.
 *
 * A slug that matches nothing falls back to Estonian and renders
 * `not-found.tsx` inside this shell.
 */
export default async function RunnerLayout({
    children,
    params
}: LayoutProps<"/k/[slug]">) {
    const { slug } = await params;
    const found = await loadRunnerSurvey(slug);
    const { locale, messages, timeZone } = await getRunnerTranslations(
        found?.survey.locale ?? DEFAULT_LOCALE
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
