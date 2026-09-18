"use client";

import { ArrowUpRight, LayoutList } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { useWaveName } from "@/components/comparisons/wave-name";
import { WaveQuestionCard } from "@/components/results/wave-question-card";
import { LABEL, META, PANEL_HEAD } from "@/components/type";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MIN_COMPARED_WAVES } from "@/domain/comparison";
import type { ComparisonId, WaveGroupId } from "@/domain/ids";
import type { WaveComparison } from "@/lib/results/wave-comparison";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * One saved comparison, drawn (docs/DECISIONS.md 035).
 *
 * The comparison arrives built: the page runs `buildComparison` on the server
 * and this receives summaries, never responses. The waves are the series,
 * oldest first, named by their label or their creation date.
 */
export function WaveComparisonScreen({
    comparisonId,
    waveGroupId,
    name,
    comparison
}: {
    readonly comparisonId: ComparisonId;
    readonly waveGroupId: WaveGroupId;
    readonly name: string;
    readonly comparison: WaveComparison;
}) {
    const t = useTranslations("Waves");
    const format = useFormatter();
    const waveName = useWaveName();

    const responses = comparison.waves.reduce(
        (total, wave) => total + wave.responseCount,
        0
    );
    const matchesLink = ROUTES.comparisonMatches(comparisonId);

    return (
        <>
            <AppBar
                constrained
                title={name}
                meta={t("title")}
                actions={
                    <>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-[30px] rounded-lg text-xs"
                        >
                            <Link
                                href={ROUTES.compare(waveGroupId)}
                                aria-label={t("result.allComparisons")}
                            >
                                <LayoutList aria-hidden />
                                <span className="hidden sm:inline">
                                    {t("result.allComparisons")}
                                </span>
                            </Link>
                        </Button>
                        <Button
                            asChild
                            size="sm"
                            className="h-[30px] rounded-lg text-xs"
                        >
                            <Link href={matchesLink}>
                                {t("result.editMatches")}
                            </Link>
                        </Button>
                    </>
                }
            />

            {/* A `div`, not a `main`: `SidebarInset` already renders one. */}
            <div className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}>
                <Card className="gap-2.5 rounded-xl px-4 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className={PANEL_HEAD}>
                            {t("waves", { count: comparison.waves.length })}
                        </h2>
                        <span className={cn(META, "text-muted-foreground")}>
                            {t("responses", { count: responses })}
                        </span>
                    </div>

                    {/* The legend for the whole screen: the wave, its colour in
                        the charts below, and the way into its own results. */}
                    <ul className="flex flex-wrap gap-x-4 gap-y-2">
                        {comparison.waves.map((wave, index) => (
                            <li key={wave.surveyId}>
                                <Link
                                    href={ROUTES.results(wave.surveyId)}
                                    className="flex items-center gap-1.5 rounded-xs hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                                >
                                    <span
                                        aria-hidden
                                        style={{
                                            background: `var(--chart-${index + 1})`
                                        }}
                                        className="inline-block h-2.5 w-4 rounded-xs border"
                                    />
                                    <span className={LABEL}>
                                        {waveName(wave)}
                                    </span>
                                    <span
                                        className={cn(
                                            META,
                                            "text-muted-foreground"
                                        )}
                                    >
                                        {format.number(wave.responseCount)}
                                    </span>
                                    <ArrowUpRight
                                        aria-hidden
                                        className="size-3 text-muted-foreground"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Card>

                {comparison.waves.length < MIN_COMPARED_WAVES ? (
                    <ComparisonEmptyState
                        which="tooFewWaves"
                        href={matchesLink}
                    />
                ) : comparison.rows.length === 0 ? (
                    <ComparisonEmptyState
                        which="noMatches"
                        href={matchesLink}
                    />
                ) : responses === 0 ? (
                    <ComparisonEmptyState
                        which="noResponses"
                        href={ROUTES.compare(waveGroupId)}
                    />
                ) : (
                    comparison.rows.map((row, index) => (
                        <WaveQuestionCard
                            key={row.id}
                            row={row}
                            waves={comparison.waves}
                            position={index + 1}
                        />
                    ))
                )}
            </div>
        </>
    );
}

function ComparisonEmptyState({
    which,
    href
}: {
    readonly which: "tooFewWaves" | "noMatches" | "noResponses";
    readonly href: string;
}) {
    const t = useTranslations("Waves");

    return (
        <Card className="gap-3 rounded-xl px-4 py-3.5">
            <EmptyState
                title={t(`empty.${which}.title`)}
                body={t(`empty.${which}.body`)}
                preview={
                    <>
                        <EmptyStateRow />
                        <EmptyStateRow />
                        <EmptyStateRow />
                    </>
                }
                actions={
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded-lg text-xs"
                    >
                        <Link href={href}>
                            {which === "noResponses"
                                ? t("result.allComparisons")
                                : t("result.editMatches")}
                        </Link>
                    </Button>
                }
            />
        </Card>
    );
}
