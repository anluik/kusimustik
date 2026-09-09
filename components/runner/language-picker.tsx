"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SurveyLocale } from "@/domain/content";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Which of the survey's languages the respondent is reading it in
 * (docs/PLAN.md Phase 12, step 3).
 *
 * **Links, not a control.** Each language is its own URL, so the picker is
 * three anchors and no JavaScript: the choice survives a reload, it can be
 * shared, and — the reason DECISIONS 011 refused a cookie in the first place —
 * the page still renders without reading anything about the request. The
 * survey's own language is the bare `/k/<slug>`, which is the link the owner
 * hands out; only the others carry a segment.
 *
 * **A full page load, deliberately.** `<a>` rather than `next/link`: the
 * language is `<html lang>` and the whole chrome catalogue as well as the
 * questions, all of it decided in the root layout, and a document load is the
 * one navigation that is certain to bring every part of it. It costs a
 * respondent nothing they can feel — the answers already typed are in
 * `localStorage` under a key that does not mention the language, so the draft
 * comes back on the other side — and it does not prefetch two more copies of
 * the survey onto a phone that will only ever read one.
 *
 * It renders nothing for a survey offered in one language, which is most of
 * them: a picker with one entry is a choice nobody has.
 *
 * The language it is already in gets the runner's selected treatment — the
 * 1.5px border and the accent fill from DESIGN §4 — plus a tick and
 * `aria-current`, because colour is never the only encoding (§10).
 *
 * The language names are endonyms and are therefore the same three strings in
 * all three catalogues. That is the point of them: someone who cannot read the
 * page has to recognise their own language on it.
 */
export function LanguagePicker({
    slug,
    active,
    source,
    locales
}: {
    readonly slug: string;
    /** The language the page is being read in. */
    readonly active: SurveyLocale;
    /** The language the survey is written in; its URL has no segment. */
    readonly source: SurveyLocale;
    /** Every language the survey is offered in, in `LOCALES` order. */
    readonly locales: readonly SurveyLocale[];
}) {
    const t = useTranslations("RunnerLanguage");

    if (locales.length < 2) return null;

    return (
        <nav aria-label={t("label")}>
            <ul className="flex flex-wrap gap-2">
                {locales.map(locale => {
                    const current = locale === active;
                    return (
                        <li key={locale} className="min-w-[96px] flex-1">
                            <a
                                href={
                                    locale === source
                                        ? ROUTES.runner(slug)
                                        : ROUTES.runnerInLocale(slug, locale)
                                }
                                hrefLang={locale}
                                {...(current && { "aria-current": "page" })}
                                className={cn(
                                    "flex min-h-11 items-center justify-center rounded-survey border px-3 text-center text-[14px] leading-[1.35] transition-colors",
                                    "focus-visible:border-survey-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none",
                                    current
                                        ? "border-[1.5px] border-survey-primary bg-survey-accent font-medium text-survey-accent-foreground"
                                        : "border-input hover:bg-muted/60"
                                )}
                            >
                                {current && (
                                    <Check
                                        aria-hidden
                                        className="mr-1.5 size-4 shrink-0"
                                    />
                                )}
                                {t(`name.${locale}`)}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
