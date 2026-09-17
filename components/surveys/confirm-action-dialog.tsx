"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import { ConfirmDialog } from "@/components/shell/confirm-dialog";
import type { SurveyActionError } from "@/lib/surveys/errors";

/**
 * The confirm step for publish, close and delete.
 *
 * DESIGN.md §5 asks for an `AlertDialog` on close and delete because both are
 * irreversible from the owner's point of view. Publishing gets one too: it is
 * the moment a survey stops being private, which is not something to discover
 * after the fact.
 */
export function ConfirmActionDialog(
    props: Omit<
        ComponentProps<typeof ConfirmDialog<SurveyActionError>>,
        "errorMessage"
    >
) {
    const t = useTranslations("Surveys.errors");
    return <ConfirmDialog {...props} errorMessage={error => t(error)} />;
}
