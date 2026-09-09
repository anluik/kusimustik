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
 * The count beside it is how much of the language on screen is still
 * untranslated, in fields rather than in questions: a question with a
 * translated title and four untranslated options is four pieces of work, and
 * counting it as one would make the number read as "nearly done" when it is
 * not.
 */
export function LanguageSwitcher({
    locale,
    source,
    locales,
    missing,
    onSelect
}: {
    readonly locale: SurveyLocale;
    /** The language the survey is written in; it is never "untranslated". */
    readonly source: SurveyLocale;
    /** Every language the survey is offered in, in `LOCALES` order. */
    readonly locales: readonly SurveyLocale[];
    /** Fields with no text in `locale`. Zero while editing the source. */
    readonly missing: number;
    readonly onSelect: (locale: SurveyLocale) => void;
}) {
    const t = useTranslations("Builder.translation");
    const tLanguage = useTranslations("Language");

    if (locales.length < 2) return null;

    return (
        <div className="flex min-w-0 items-center gap-2">
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

            {/* Never on the source language: what a survey is written in is
                not a translation that is behind. */}
            {locale !== source && (
                <span className="hidden font-mono text-[10px] leading-none whitespace-nowrap text-muted-foreground sm:inline">
                    {missing === 0
                        ? t("complete")
                        : t("missing", { count: missing })}
                </span>
            )}
        </div>
    );
}
