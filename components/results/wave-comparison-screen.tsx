"use client";

import { ArrowUpRight, LayoutList } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import {
    WaveQuestionCard,
    useWaveName
} from "@/components/results/wave-question-card";
import { LABEL, META, PANEL_HEAD } from "@/components/results/type";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WaveResponses } from "@/lib/db/waves";
import { buildWaveComparison } from "@/lib/results/wave-comparison";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Wave comparison (PLAN Phase 11): one recurring survey's waves side by side.
 *
 * The alignment is `buildWaveComparison`'s and happens here rather than on the
 * server for the same reason the results screen shapes its own summaries — it
 * is pure, it is cheap, and the page already holds the rows. What the server
 * does is the reading (`listWaveGroupResponses`), which is three queries however
 * many waves there are.
 *
 * The waves themselves are the series, oldest first, and they are named by
 * their `waveLabel` — free text the owner wrote ("2026", "Q1"), which is
 * exactly what DECISIONS 003 reserved it for.
 */
export function WaveComparisonScreen({
    waves,
    title
}: {
    readonly waves: readonly WaveResponses[];
    /** The newest wave's title: the wording the owner last chose. */
    readonly title: string;
}) {
    const t = useTranslations("Waves");
    const format = useFormatter();
    const waveName = useWaveName();

    const comparison = useMemo(() => buildWaveComparison(waves), [waves]);

    const responses = comparison.waves.reduce(
        (total, wave) => total + wave.responseCount,
        0
    );

    return (
        <>
            <AppBar
                constrained
                title={title}
                meta={t("title")}
                actions={
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded text-xs"
                    >
                        <Link href={ROUTES.surveys}>
                            <LayoutList aria-hidden />
                            {t("backToSurveys")}
                        </Link>
                    </Button>
                }
            />

            {/* A `div`, not a `main`: `SidebarInset` already renders one. */}
            <div className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}>
                <Card className="gap-2.5 rounded px-3.5 py-3">
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

                    {comparison.omittedWaveCount > 0 && (
                        // DESIGN §7 has five categorical colours and the wave is
                        // the category, so older waves are left out — and said
                        // to be left out, never dropped quietly.
                        <p className={cn(META, "text-muted-foreground")}>
                            {t("omitted", {
                                shown: comparison.waves.length,
                                omitted: comparison.omittedWaveCount
                            })}
                        </p>
                    )}
                </Card>

                {comparison.questions.length === 0 ? (
                    <NoQuestions />
                ) : responses === 0 ? (
                    <NoResponses />
                ) : (
                    comparison.questions.map((question, index) => (
                        <WaveQuestionCard
                            key={question.key}
                            question={question}
                            waves={comparison.waves}
                            position={index + 1}
                        />
                    ))
                )}
            </div>
        </>
    );
}

/** Every wave is a questionnaire of statements, or of nothing at all. */
function NoQuestions() {
    const t = useTranslations("Waves.empty.noQuestions");
    return <ComparisonEmptyState title={t("title")} body={t("body")} />;
}

/** The waves exist and are aligned; nobody has answered any of them yet. */
function NoResponses() {
    const t = useTranslations("Waves.empty.noResponses");
    return <ComparisonEmptyState title={t("title")} body={t("body")} />;
}

function ComparisonEmptyState({
    title,
    body
}: {
    readonly title: string;
    readonly body: string;
}) {
    const t = useTranslations("Waves");

    return (
        <Card className="gap-3 rounded px-3.5 py-3">
            <EmptyState
                title={title}
                body={body}
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
                        className="h-[30px] rounded text-xs"
                    >
                        <Link href={ROUTES.surveys}>{t("backToSurveys")}</Link>
                    </Button>
                }
            />
        </Card>
    );
}
