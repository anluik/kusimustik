"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/surveys/confirm-action-dialog";
import { DuplicateSurveyDialog } from "@/components/surveys/duplicate-survey-dialog";
import { RenameSurveyDialog } from "@/components/surveys/rename-survey-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/lib/routes";
import {
    closeSurveyAction,
    deleteSurveyAction,
    publishSurveyAction
} from "@/lib/surveys/actions";
import type { SurveyListItem } from "@/lib/surveys/list";

type RowDialog = "duplicate" | "rename" | "publish" | "close" | "delete";

/**
 * DESIGN.md §5: one actions menu serves both row kinds, and only the first
 * item's wording changes — "duplicate" on a standalone survey, "new wave" on a
 * wave group. §6: an item that is contextually unavailable stays in the menu,
 * disabled, so the menu's shape never shifts under the pointer.
 *
 * Every dialog is a sibling of the menu rather than a child of it: a dialog
 * nested inside `DropdownMenuContent` is unmounted the moment the menu closes.
 */
export function SurveyRowActions({
    survey,
    isWave
}: {
    readonly survey: SurveyListItem;
    /** A wave of a series rather than a survey on its own. */
    readonly isWave: boolean;
}) {
    const t = useTranslations("Surveys.rowActions");
    const tPublish = useTranslations("Surveys.publish");
    const tClose = useTranslations("Surveys.close");
    const tDelete = useTranslations("Surveys.delete");

    const [dialog, setDialog] = useState<RowDialog | null>(null);

    const canPublish =
        survey.status !== "published" && survey.questionCount > 0;
    const wasPublishedBefore = survey.slug !== null;

    // A wave group is named for its newest wave, so "delete «Employer brand
    // survey»" on a wave row reads like deleting the whole series. Naming the
    // wave says which single survey is actually going.
    const displayTitle =
        survey.waveLabel === null
            ? survey.title
            : `${survey.title} · ${survey.waveLabel}`;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("label")}
                        className="rounded text-muted-foreground"
                    >
                        <MoreHorizontal aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded">
                    <DropdownMenuItem
                        className="rounded text-xs"
                        onSelect={() => setDialog("duplicate")}
                    >
                        {isWave ? t("newWave") : t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="rounded text-xs"
                        onSelect={() => setDialog("rename")}
                    >
                        {t("rename")}
                    </DropdownMenuItem>
                    {/* DESIGN §6: an item that is contextually unavailable
                        stays in the menu rather than disappearing, so the
                        menu's shape never shifts under the pointer. A survey
                        that has never been published has nothing to show. */}
                    <DropdownMenuItem
                        asChild={wasPublishedBefore}
                        disabled={!wasPublishedBefore}
                        className="rounded text-xs"
                    >
                        {wasPublishedBefore ? (
                            <Link href={ROUTES.results(survey.id)}>
                                {t("results")}
                            </Link>
                        ) : (
                            <span>{t("results")}</span>
                        )}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        disabled={!canPublish}
                        className="rounded text-xs"
                        onSelect={() => setDialog("publish")}
                    >
                        {t("publish")}
                        {survey.questionCount === 0 && (
                            // Says why it is disabled, in place: a menu item
                            // that is simply dead teaches the owner nothing.
                            <DropdownMenuShortcut className="font-mono text-[10px] tracking-[0.04em]">
                                {t("publishBlocked")}
                            </DropdownMenuShortcut>
                        )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={survey.status !== "published"}
                        className="rounded text-xs"
                        onSelect={() => setDialog("close")}
                    >
                        {t("close")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        variant="destructive"
                        className="rounded text-xs"
                        onSelect={() => setDialog("delete")}
                    >
                        {t("delete")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DuplicateSurveyDialog
                surveyId={survey.id}
                isWave={isWave}
                open={dialog === "duplicate"}
                onOpenChange={open => setDialog(open ? "duplicate" : null)}
            />

            <RenameSurveyDialog
                surveyId={survey.id}
                currentTitle={survey.title}
                open={dialog === "rename"}
                onOpenChange={open => setDialog(open ? "rename" : null)}
            />

            <ConfirmActionDialog
                open={dialog === "publish"}
                onOpenChange={open => setDialog(open ? "publish" : null)}
                title={tPublish("title")}
                // A survey that has been published before keeps its slug, so
                // the promise made here is different: the old link still works.
                body={
                    wasPublishedBefore
                        ? tPublish("bodyReopen")
                        : tPublish("body")
                }
                confirmLabel={tPublish("submit")}
                run={() => publishSurveyAction({ surveyId: survey.id })}
            />

            <ConfirmActionDialog
                open={dialog === "close"}
                onOpenChange={open => setDialog(open ? "close" : null)}
                title={tClose("title")}
                body={tClose("body")}
                confirmLabel={tClose("submit")}
                run={() => closeSurveyAction({ surveyId: survey.id })}
            />

            <ConfirmActionDialog
                destructive
                open={dialog === "delete"}
                onOpenChange={open => setDialog(open ? "delete" : null)}
                title={tDelete("title")}
                body={
                    survey.responseCount > 0
                        ? tDelete("bodyWithResponses", {
                              title: displayTitle,
                              count: survey.responseCount
                          })
                        : tDelete("body", { title: displayTitle })
                }
                confirmLabel={tDelete("submit")}
                run={() => deleteSurveyAction({ surveyId: survey.id })}
            />
        </>
    );
}
