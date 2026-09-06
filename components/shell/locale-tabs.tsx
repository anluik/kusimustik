"use client";

import { hasLocale, useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setLocale } from "@/lib/i18n/actions";
import { UI_LOCALES } from "@/lib/i18n/locales";

/**
 * DESIGN.md §5: `Tabs`, `h-7`, Mono 10px. Writing the cookie is a Server
 * Action, and `refresh()` inside it re-renders the tree in the new language —
 * there is no locale in the URL to navigate to. See docs/DECISIONS.md 011.
 */
export function LocaleTabs() {
    const t = useTranslations("Language");
    const current = useLocale();
    const [isPending, startTransition] = useTransition();

    return (
        <Tabs
            value={current}
            onValueChange={value => {
                if (!hasLocale(UI_LOCALES, value)) return;
                startTransition(async () => {
                    await setLocale(value);
                });
            }}
        >
            <TabsList
                aria-label={t("label")}
                className="grid h-7 w-full grid-cols-3 rounded p-0.5"
            >
                {UI_LOCALES.map(locale => (
                    <TabsTrigger
                        key={locale}
                        value={locale}
                        disabled={isPending}
                        aria-label={t(`name.${locale}`)}
                        className="h-6 rounded font-mono text-[10px] leading-none tracking-[0.07em]"
                    >
                        {t(`short.${locale}`)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
