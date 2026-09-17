"use client";

import { useTranslations } from "next-intl";

import { ErrorLine } from "@/components/shell/error-line";
import type { SurveyActionError } from "@/lib/surveys/errors";

/** A survey action's failure, in the survey list's own words. */
export function ActionError({
    error
}: {
    readonly error: SurveyActionError | null;
}) {
    const t = useTranslations("Surveys.errors");
    return <ErrorLine message={error === null ? null : t(error)} />;
}
