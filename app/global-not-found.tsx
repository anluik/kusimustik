import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import "@/app/globals.css";

import { Button } from "@/components/ui/button";
import { display, sans, mono } from "@/lib/fonts";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { DISPLAY } from "@/components/type";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("NotFound");
    return { title: t("title") };
}

/**
 * With several root layouts there is no single one to compose a 404 from, so
 * Next.js wants a whole document here. It carries no session and no sidebar on
 * purpose — an unauthenticated stranger can reach this page.
 */
export default async function GlobalNotFound() {
    const locale = await getLocale();
    const t = await getTranslations("NotFound");

    return (
        <html
            lang={locale}
            className={cn(sans.variable, display.variable, mono.variable)}
        >
            <body className="grid min-h-svh place-items-center bg-background p-4 font-sans text-foreground antialiased">
                <main className="flex w-full max-w-[420px] flex-col gap-4 rounded-xl border border-border/70 bg-card px-6 py-6 shadow-sm">
                    <h1 className={cn(DISPLAY, "text-[22px] text-balance")}>
                        {t("title")}
                    </h1>
                    <p className="text-[14px] leading-[1.5] text-pretty text-muted-foreground">
                        {t("body")}
                    </p>
                    <Button
                        asChild
                        size="sm"
                        className="h-9 w-fit rounded-lg text-[13px]"
                    >
                        <Link href={ROUTES.surveys}>{t("action")}</Link>
                    </Button>
                </main>
            </body>
        </html>
    );
}
