"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { DwellChart } from "@/components/results/dwell-chart";
import { LABEL, META, PANEL_HEAD } from "@/components/results/type";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { assertNever } from "@/domain/assert-never";
import type { SurveyId } from "@/domain/ids";
import { barWidth } from "@/lib/results/chart-data";
import type { Funnel, FunnelStage } from "@/lib/results/funnel";
import { rampFill } from "@/lib/results/ramp";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The drop-off funnel.
 *
 * DESIGN.md §5 and §11.2: **deliberately not Recharts.** Fifteen directly
 * labelled rows with a flag column fight the library, so this is a CSS grid
 * with a `div` bar per stage. Do not migrate it.
 *
 * §7: the ramp encodes position in the sequence, never health. A stage that is
 * performing badly is flagged in the row chrome — a destructive gutter mark,
 * the drop figure in destructive, an outline badge — and is never recoloured,
 * which keeps the colour channel honest and the flag readable for someone who
 * cannot see the hue difference.
 */
export function FunnelPanel({
    funnel,
    surveyId
}: {
    readonly funnel: Funnel;
    readonly surveyId: SurveyId;
}) {
    const t = useTranslations("Results.funnel");

    if (funnel.isEmpty) {
        return (
            <Card className="gap-3 rounded px-3.5 py-3">
                <EmptyState
                    title={t("empty.title")}
                    body={t("empty.body")}
                    preview={
                        <>
                            <EmptyStateRow />
                            <EmptyStateRow />
                            <EmptyStateRow />
                        </>
                    }
                />
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {funnel.worstStage !== null && (
                <ProblemCallout stage={funnel.worstStage} surveyId={surveyId} />
            )}

            <Card className="gap-3 rounded px-3.5 py-3">
                <h3 className={PANEL_HEAD}>{t("title")}</h3>
                {/* One grid for the whole funnel, with the rows as subgrids:
                    the label, bar, count and flag columns are then sized once
                    and line up down the list. */}
                <ol className="grid grid-cols-[1fr_minmax(0,2fr)_auto] gap-x-3 gap-y-1.5">
                    {funnel.stages.map(stage => (
                        <StageRow key={stage.id} stage={stage} />
                    ))}
                </ol>
            </Card>

            <DwellChart stages={funnel.stages} />
        </div>
    );
}

/**
 * A stage's name: the question's own title, or the catalogue's wording for the
 * three survey-level stages.
 *
 * The switch is exhaustive rather than a `stages.${stage.kind}` template,
 * because `question` has no key in the catalogue and never should — its name
 * is the author's own text. next-intl's typed keys reject the template, which
 * is the type system noticing exactly that.
 */
function useStageName(): (stage: FunnelStage) => string {
    const t = useTranslations("Results.funnel.stages");

    return stage => {
        if (stage.title !== null) return stage.title;
        switch (stage.kind) {
            case "view":
                return t("view");
            case "start":
                return t("start");
            case "submit":
                return t("submit");
            case "question":
                // Unreachable: `buildFunnel` gives every question stage the
                // question's title, and only question stages carry one.
                return stage.id;
            default:
                return assertNever(stage.kind, "funnel stage kind");
        }
    };
}

function StageRow({ stage }: { readonly stage: FunnelStage }) {
    const t = useTranslations("Results.funnel");
    const format = useFormatter();
    const stageName = useStageName();

    return (
        <li
            // `display: contents`, so the three cells below become items of the
            // *list's* grid rather than of a grid per row. A grid on each `li`
            // sizes its columns independently, which is how a funnel ends up
            // with every bar starting at a different x — the one thing the grid
            // is here to prevent.
            className="col-span-full grid grid-cols-subgrid items-center gap-3"
        >
            <div className="flex min-w-0 items-center gap-2">
                {/* §5: the flag is a 2px destructive mark in the row gutter. */}
                <span
                    aria-hidden
                    className={cn(
                        "h-6 w-0.5 shrink-0 rounded-full",
                        stage.isProblem ? "bg-destructive" : "bg-transparent"
                    )}
                />
                <span className="truncate text-xs leading-none">
                    {stageName(stage)}
                </span>
            </div>

            <div className="flex min-w-0 items-center gap-2">
                <span className="h-5 min-w-0 flex-1 rounded-xs bg-ramp-track">
                    <span
                        className="block h-full rounded-xs border"
                        style={{
                            // DESIGN §7: a dot decimal. A locale-formatted
                            // number here is invalid CSS, dropped in silence.
                            width: barWidth(stage.share),
                            background: rampFill(stage.rampStep)
                        }}
                    />
                </span>
                <span className={cn(META, "w-14 shrink-0 text-right")}>
                    {format.number(stage.count)}
                </span>
            </div>

            <div className="flex items-center justify-end gap-2">
                {stage.skipped !== null && stage.skipped > 0 && (
                    <span className={cn(META, "text-muted-foreground")}>
                        {t("skipped", { count: stage.skipped })}
                    </span>
                )}
                {stage.dropPp !== null && stage.dropPp > 0 && (
                    <span
                        className={cn(
                            META,
                            "w-16 text-right",
                            stage.isProblem
                                ? "text-destructive"
                                : "text-muted-foreground"
                        )}
                    >
                        {t("drop", {
                            value: format.number(stage.dropPp, {
                                maximumFractionDigits: 1
                            })
                        })}
                    </span>
                )}
                {stage.isProblem && (
                    <Badge
                        variant="outline"
                        className={cn(
                            META,
                            "h-4 rounded border-destructive px-1 text-destructive"
                        )}
                    >
                        {t("problem")}
                    </Badge>
                )}
            </div>
        </li>
    );
}

/**
 * DESIGN §5: an `Alert` with `bg-muted` and an inset destructive rule, and one
 * outline button jumping to the editor. Named for one stage, not a list — an
 * owner shown five problems fixes none of them.
 */
function ProblemCallout({
    stage,
    surveyId
}: {
    readonly stage: FunnelStage;
    readonly surveyId: SurveyId;
}) {
    const t = useTranslations("Results.funnel");
    const format = useFormatter();
    const name = useStageName()(stage);

    return (
        <div
            role="alert"
            className="flex flex-col gap-2 rounded bg-muted px-3.5 py-3 shadow-[inset_3px_0_0_var(--destructive)]"
        >
            <p className={cn(LABEL, "text-destructive")}>{t("problem")}</p>
            <p className="text-[14px] leading-[1.35] font-semibold">
                {t("callout.title", { stage: name })}
            </p>
            <p className="max-w-prose text-xs leading-[1.35] text-muted-foreground">
                {/* `questionId` is what separates a question from the way
                    into one. Telling an owner whose steepest drop is
                    "Vastamist alustatud" to check whether the question is too
                    long or too personal is advice about a question that does
                    not exist. */}
                {t(
                    stage.questionId === null
                        ? "callout.bodyStage"
                        : "callout.body",
                    {
                        value: format.number(stage.dropPp ?? 0, {
                            maximumFractionDigits: 1
                        })
                    }
                )}
            </p>
            {stage.questionId !== null && (
                <div>
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded text-xs"
                    >
                        <Link
                            href={`${ROUTES.builder(surveyId)}#${stage.questionId}`}
                        >
                            {t("callout.action")}
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}
