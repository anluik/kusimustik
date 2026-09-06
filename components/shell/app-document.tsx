import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { sans, mono } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/**
 * The `<html>` document shared by the owner surfaces. It is not a layout of
 * its own: `app/(app)` and `app/(auth)` are separate root layouts so that the
 * respondent runner can be a third one with its `lang` taken from
 * `survey.locale` rather than from this cookie. See docs/DECISIONS.md 011.
 */
export async function AppDocument({
    children
}: {
    readonly children: ReactNode;
}) {
    const locale = await getLocale();

    return (
        <html
            lang={locale}
            className={cn(sans.variable, mono.variable)}
            suppressHydrationWarning
        >
            <body className="min-h-svh bg-background font-sans text-foreground antialiased">
                <NextIntlClientProvider>
                    <ThemeProvider>
                        <TooltipProvider>{children}</TooltipProvider>
                    </ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
