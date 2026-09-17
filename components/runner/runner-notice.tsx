"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DISPLAY } from "@/components/type";

/**
 * The runner's terminal screens: the link matched nothing, the survey has
 * stopped collecting, it has nothing to ask, the answers are in, and — from
 * `error.tsx` — the page itself failed. `failed` is the only one with an
 * action, because it is the only one the respondent can do anything about.
 *
 * Each names the survey it is about wherever the survey is known: these are
 * the only screens a respondent sees with nothing else on them, and an
 * unattributed "thank you" is indistinguishable from a page that half loaded.
 *
 * A client component so it takes its wording from the `NextIntlClientProvider`
 * the root layout set up from `survey.locale` — a server component under that
 * layout has no translator, because the runner deliberately does not go
 * through `lib/i18n/request.ts` (docs/DECISIONS.md 011). The namespaces are
 * read unconditionally and chosen between, rather than composed from the
 * `kind`, so every key is a literal the type checker can see.
 */
export function RunnerNotice({
    kind,
    surveyTitle,
    action
}: {
    readonly kind: "notFound" | "closed" | "empty" | "thanks" | "failed";
    /**
     * The survey these words are about, when it is known. A respondent who
     * has just answered — or arrived at a survey that has closed — is looking
     * at a card in an empty page, and "thank you" with nothing to attach it to
     * reads as a page that failed to load. Absent for `notFound`, where by
     * definition there is no survey to name.
     */
    readonly surveyTitle?: string;
    readonly action?: ReactNode;
}) {
    const notFound = useTranslations("RunnerNotFound");
    const closed = useTranslations("RunnerClosed");
    const empty = useTranslations("RunnerEmpty");
    const thanks = useTranslations("RunnerThanks");
    const failed = useTranslations("RunnerFailed");

    const t =
        kind === "notFound"
            ? notFound
            : kind === "closed"
              ? closed
              : kind === "empty"
                ? empty
                : kind === "failed"
                  ? failed
                  : thanks;

    return (
        <main className="grid min-h-svh place-items-center p-3.5">
            <div className="flex w-full max-w-[440px] flex-col gap-2 rounded-survey border border-border/70 bg-survey-card px-5 py-5 shadow-sm">
                {surveyTitle !== undefined && (
                    <p className="text-[14px] leading-[1.35] font-medium text-muted-foreground">
                        {surveyTitle}
                    </p>
                )}
                <h1 className={cn(DISPLAY, "text-[24px] text-balance")}>
                    {t("title")}
                </h1>
                <p className="text-[15px] leading-[1.5] text-pretty text-muted-foreground">
                    {t("body")}
                </p>
                {action !== undefined && (
                    <div className="flex pt-1">{action}</div>
                )}
            </div>
        </main>
    );
}
