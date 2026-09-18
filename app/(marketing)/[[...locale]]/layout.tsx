import "@/app/globals.css";

import { NextIntlClientProvider } from "next-intl";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { display, sans, mono } from "@/lib/fonts";
import {
    getMarketingTranslations,
    landingLocale,
    readLandingSegment
} from "@/lib/i18n/marketing";
import { cn } from "@/lib/utils";

/**
 * The landing page's root layout, the fourth, and the same reason as the
 * other three: `<html lang>` differs by surface, so there is no
 * `app/layout.tsx` (docs/DECISIONS.md 011).
 *
 * It sits under the optional `[[...locale]]` segment for the reason the
 * runner's does (033): the language being read is the segment, and only a root
 * layout can set `lang`. One segment serves `/`, `/en` and `/ru`, so all three
 * share this layout rather than needing three of them.
 *
 * Nothing here reads the request. The landing page is the most-cached document
 * the site has, and a cookie lookup would cost that for a preference the URL
 * already states. See docs/DECISIONS.md 038.
 */
export default async function MarketingLayout({
    children,
    params
}: LayoutProps<"/[[...locale]]">) {
    const { locale: segments } = await params;
    const { locale, messages, timeZone } = await getMarketingTranslations(
        landingLocale(readLandingSegment(segments))
    );

    return (
        <html
            lang={locale}
            className={cn(sans.variable, display.variable, mono.variable)}
            suppressHydrationWarning
        >
            <body className="min-h-svh bg-background font-sans text-foreground antialiased">
                <NextIntlClientProvider
                    locale={locale}
                    messages={messages}
                    timeZone={timeZone}
                >
                    {/* A visitor who has not signed in has no stored theme
                        preference to honour, so the page follows the device,
                        exactly as the runner does. */}
                    <ThemeProvider>{children}</ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
