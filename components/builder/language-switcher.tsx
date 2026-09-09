"use client";

import { hasLocale, useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SurveyLocale } from "@/domain/content";
import { UI_LOCALES } from "@/lib/i18n/locales";

/**
 * Which of the survey's languages the builder is editing.
 *
 * The whole translation surface is this control plus a set of placeholders:
 * switch the language and the same panel, the same canvas and the same list
 * hold the other one. Nothing is duplicated on screen, which is what PLAN
 * Phase 12 asks for and what a side-by-side pair of fields could not give at
 * 340px. See docs/DECISIONS.md 031.
 *
 * It renders nothing at all for a survey offered in one language — the common
 * case, and a one-tab tab strip is a control with no choice in it. The
 * settings dialog is where a second language is added, which is also where the
 * author already goes to say what language the survey *is*.
 *
 * It is only the switch. What is still untranslated is said where the author
 * can act on it — beside the question it belongs to, in the element list —
 * and once more in the publish dialog, which is the moment it starts to
 * matter. A running total in the app bar was a number with nowhere to go.
 */
export function LanguageSwitcher({
    locale,
    source,
    locales,
    onSelect
}: {
    readonly locale: SurveyLocale;
    /** The language the survey is written in; it is never "untranslated". */
    readonly source: SurveyLocale;
    /** Every language the survey is offered in, in `LOCALES` order. */
    readonly locales: readonly SurveyLocale[];
    readonly onSelect: (locale: SurveyLocale) => void;
}) {
    const t = useTranslations("Builder.translation");
    const tLanguage = useTranslations("Language");

    if (locales.length < 2) return null;

    return (
        <Tabs
            value={locale}
            onValueChange={value => {
                if (hasLocale(UI_LOCALES, value)) onSelect(value);
            }}
        >
            <TabsList
                aria-label={t("label")}
                className="h-[30px] rounded p-0.5"
            >
                {locales.map(option => (
                    <TabsTrigger
                        key={option}
                        value={option}
                        aria-label={
                            option === source
                                ? t("sourceOption", {
                                      language: tLanguage(`name.${option}`)
                                  })
                                : tLanguage(`name.${option}`)
                        }
                        className="h-[26px] rounded px-2 font-mono text-[10px] leading-none tracking-[0.07em]"
                    >
                        {tLanguage(`short.${option}`)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
