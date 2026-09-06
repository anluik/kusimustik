"use client";

import { useTranslations } from "next-intl";

import type { SurveyActionError } from "@/lib/surveys/errors";

/**
 * DESIGN.md §6: an error is text-first and local to what failed — never a
 * toast for something the owner has to act on, and never a full-page error for
 * one dialog's failure. It sits inside the dialog that produced it, so the
 * inputs the owner needs to change are still on screen.
 */
export function ActionError({
    error
}: {
    readonly error: SurveyActionError | null;
}) {
    const t = useTranslations("Surveys.errors");
    if (error === null) return null;

    return (
        <p
            role="alert"
            className="flex items-start gap-1.5 text-xs leading-[1.35] text-destructive"
        >
            <span
                aria-hidden
                className="mt-1 size-1.5 shrink-0 rounded-4xl bg-destructive"
            />
            {t(error)}
        </p>
    );
}
