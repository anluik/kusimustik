"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { RunnerNotice } from "@/components/runner/runner-notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The respondent's error boundary (docs/PLAN.md Phase 8).
 *
 * The runner is the priority surface (DESIGN §10) and a respondent cannot be
 * asked to do anything clever, so this is the notice they already see for a
 * closed survey with one full-width action on it. It renders inside the
 * runner's own root layout, so the wording is still the survey's language and
 * the survey theming namespace still applies.
 *
 * A failure here does not lose the answers: the draft is in `localStorage`
 * under a key derived from the survey and its version, so reloading brings
 * back what was typed.
 */
export default function RunnerError({
    error,
    reset
}: {
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
}) {
    const t = useTranslations("RunnerErrors");

    useEffect(() => {
        console.error("runner failed", error);
    }, [error]);

    return (
        <RunnerNotice
            kind="failed"
            action={
                <Button
                    type="button"
                    onClick={reset}
                    className={cn(
                        "min-h-12 w-full rounded-survey text-[15px] font-medium",
                        "bg-survey-primary text-survey-primary-foreground hover:bg-survey-primary/90"
                    )}
                >
                    {t("retry")}
                </Button>
            }
        />
    );
}
