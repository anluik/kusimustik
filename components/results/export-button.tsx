"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { SurveyId } from "@/domain/ids";
import { ROUTES } from "@/lib/routes";

/**
 * The CSV download (docs/PLAN.md Phase 8).
 *
 * A plain anchor, not a fetch: the browser navigates to the route handler and
 * the `Content-Disposition` it answers with is what saves the file. `download`
 * is a hint only — the header is what decides the name, because it is the
 * server that knows the survey's title.
 *
 * With nothing collected it is disabled rather than absent: DESIGN §6 keeps
 * contextually unavailable controls in place so the surface's shape is stable,
 * and disables with the `--input` token rather than opacity.
 */
export function ExportButton({
    surveyId,
    enabled
}: {
    readonly surveyId: SurveyId;
    readonly enabled: boolean;
}) {
    const t = useTranslations("Results.export");

    if (!enabled) {
        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="h-[30px] rounded text-xs disabled:cursor-not-allowed disabled:text-input disabled:opacity-100"
            >
                <Download aria-hidden />
                {t("action")}
            </Button>
        );
    }

    return (
        <Button
            asChild
            variant="outline"
            size="sm"
            className="h-[30px] rounded text-xs"
        >
            <a href={ROUTES.export(surveyId)} download>
                <Download aria-hidden />
                {t("action")}
            </a>
        </Button>
    );
}
