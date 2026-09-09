"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { ChartSwitcher } from "@/components/results/chart-switcher";
import { SummaryBody } from "@/components/results/question-card";
import { LABEL, META, PANEL_HEAD, TAG } from "@/components/results/type";
import { WaveCategoryChart } from "@/components/results/wave-category-chart";
import type { WaveSeries } from "@/components/results/wave-category-chart";
import { WaveTrendChart } from "@/components/results/wave-trend-chart";
import { useElementTypeName } from "@/components/builder/element-type";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { assertNever } from "@/domain/assert-never";
import {
    chartKindsFor,
    defaultChartKind,
    supportsChartKind
} from "@/domain/charts";
import type { ChartDataShape, ChartKind } from "@/domain/charts";
import { toWaveCategoryRows, toWaveTrend } from "@/lib/results/wave-chart-data";
import type {
    ComparedQuestion,
    WaveHeader
} from "@/lib/results/wave-comparison";
import { cn } from "@/lib/utils";

/**
 * One question's card, across the waves.
 *
 * The switcher is the same one the single-wave card uses and asks the same
 * function (docs/DECISIONS.md 017) — only the shape argument differs, which is
 * what adds `line` to the menu. The encodings then split two ways:
 *
 * - **Drawn all at once**: the categorical bars, where the wave is a colour,
 *   and the trend line, where the wave is the axis.
 * - **Drawn wave by wave**: the ramps, because DESIGN §7 gives ordered data the
 *   ramp and nothing else, so the ramp's colours are already spoken for and the
 *   wave has to become a caption instead. Text questions land here too: two
 *   waves of free text are two lists.
 *
 * A wave that did not ask this question is named above the chart rather than
 * being left as a hole the owner has to notice — the same reasoning as
 * `unshownCount` on the single-wave card (DECISIONS 021).
 */

const SHAPE: ChartDataShape = "series";

export function WaveQuestionCard({
    question,
    waves,
    position
}: {
    readonly question: ComparedQuestion;
    readonly waves: readonly WaveHeader[];
    readonly position: number;
}) {
    const t = useTranslations("Waves.question");
    const tChart = useTranslations("Waves.chart");
    const format = useFormatter();
    const typeName = useElementTypeName();
    const waveName = useWaveName();

    const kinds = chartKindsFor(question.question, SHAPE);
    const [chosen, setChosen] = useState<ChartKind | null>(null);

    // The owner's choice only holds while the question still supports it — an
    // edit between waves can withdraw an encoding.
    const kind =
        chosen !== null && supportsChartKind(question.question, SHAPE, chosen)
            ? chosen
            : defaultChartKind(question.question, SHAPE);

    const series: readonly WaveSeries[] = waves.map((wave, index) => ({
        key: wave.surveyId,
        label: waveName(wave),
        fill: `var(--chart-${index + 1})`
    }));

    const answered = question.cells.reduce(
        (total, cell) =>
            total +
            (cell.state === "compared" ? cell.summary.answeredCount : 0),
        0
    );

    const notAsked = waves.filter(
        (_, index) => question.cells[index]?.state === "absent"
    );
    const notComparable = waves.filter(
        (_, index) => question.cells[index]?.state === "mismatched"
    );

    return (
        <Card
            id={`question-${question.key}`}
            className="scroll-mt-16 gap-3 rounded px-3.5 py-3"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={cn(LABEL, "text-muted-foreground")}>
                        {format.number(position)}
                    </span>
                    <h3 className={PANEL_HEAD}>{question.question.title}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="secondary"
                            className={cn(TAG, "h-4 rounded px-1")}
                        >
                            {typeName(question.question.type)}
                        </Badge>
                        {/* The key, because that is what the waves are joined
                            on and the only thing on the card that is the same
                            in every one of them. */}
                        <Badge
                            variant="outline"
                            className={cn(TAG, "h-4 rounded px-1")}
                        >
                            {question.key}
                        </Badge>
                        <span className={cn(META, "text-muted-foreground")}>
                            {t("comparedWaves", {
                                count: question.comparedCount
                            })}
                        </span>
                    </div>
                </div>

                <ChartSwitcher
                    kinds={kinds}
                    value={kind ?? kinds[0] ?? "bar_horizontal"}
                    onChange={setChosen}
                />
            </div>

            {(notAsked.length > 0 || notComparable.length > 0) && (
                <div className="flex flex-col gap-1">
                    {notAsked.length > 0 && (
                        <p className={cn(META, "text-muted-foreground")}>
                            {t("notAsked", {
                                waves: notAsked.map(waveName).join(", ")
                            })}
                        </p>
                    )}
                    {notComparable.length > 0 && (
                        <p className={cn(META, "text-muted-foreground")}>
                            {t("notComparable", {
                                waves: notComparable.map(waveName).join(", ")
                            })}
                        </p>
                    )}
                </div>
            )}

            {question.comparedCount === 0 ? (
                <p className="text-xs leading-[1.35] text-muted-foreground">
                    {t("noWave")}
                </p>
            ) : answered === 0 && kind !== null ? (
                // A chart of nothing reads as a rendering failure; the text
                // questions have no chart kind and say it their own way.
                <p className="text-xs leading-[1.35] text-muted-foreground">
                    {t("noAnswers")}
                </p>
            ) : (
                <ComparisonBody
                    question={question}
                    waves={waves}
                    series={series}
                    kind={kind}
                    metricLabel={tChart(
                        question.question.type === "nps" ? "score" : "mean"
                    )}
                />
            )}
        </Card>
    );
}

function ComparisonBody({
    question,
    waves,
    series,
    kind,
    metricLabel
}: {
    readonly question: ComparedQuestion;
    readonly waves: readonly WaveHeader[];
    readonly series: readonly WaveSeries[];
    readonly kind: ChartKind | null;
    readonly metricLabel: string;
}) {
    const trend = kind === "line" ? toWaveTrend(question) : null;

    switch (kind) {
        case "bar_horizontal":
        case "bar_vertical":
            return (
                <WaveCategoryChart
                    rows={toWaveCategoryRows(question)}
                    waves={series}
                    orientation={
                        kind === "bar_vertical" ? "vertical" : "horizontal"
                    }
                />
            );

        case "line":
            // `toWaveTrend` can refuse where `chartKindsFor` could not see the
            // reason — a later wave that added a sixth option, say. The ramps
            // and bars are still there, so falling back to them is honest.
            return trend === null ? (
                <PerWaveBodies
                    question={question}
                    waves={waves}
                    kind={defaultChartKind(question.question, SHAPE)}
                />
            ) : (
                <WaveTrendChart
                    trend={trend}
                    waveLabels={series.map(wave => wave.label)}
                    metricLabel={metricLabel}
                />
            );

        // The ramps are drawn per wave: §7 gives their colours to the scale's
        // steps, so the wave cannot also be a colour. `null` is a text
        // question, which has no encoding to choose and lands here too.
        case "ramp_bar":
        case "ramp_stacked":
        case null:
            return (
                <PerWaveBodies question={question} waves={waves} kind={kind} />
            );

        default:
            return assertNever(kind, "chart kind");
    }
}

/** One block per wave that has something to show, captioned with its label. */
function PerWaveBodies({
    question,
    waves,
    kind
}: {
    readonly question: ComparedQuestion;
    readonly waves: readonly WaveHeader[];
    readonly kind: ChartKind | null;
}) {
    const t = useTranslations("Waves.question");
    const waveName = useWaveName();

    return (
        <div className="flex flex-col gap-4">
            {question.cells.map((cell, index) => {
                const wave = waves[index];
                if (wave === undefined || cell.state !== "compared")
                    return null;

                return (
                    <div
                        key={wave.surveyId}
                        className="flex flex-col gap-2 border-l pl-3"
                    >
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className={cn(LABEL, "text-foreground")}>
                                {waveName(wave)}
                            </span>
                            <span className={cn(META, "text-muted-foreground")}>
                                {t("answered", {
                                    count: cell.summary.answeredCount
                                })}
                            </span>
                        </div>

                        {cell.summary.answeredCount === 0 &&
                        cell.summary.kind !== "text" ? (
                            <p className="text-xs leading-[1.35] text-muted-foreground">
                                {t("waveNoAnswers")}
                            </p>
                        ) : (
                            <SummaryBody summary={cell.summary} kind={kind} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** A wave without a label is still a wave; it is named for what it is. */
export function useWaveName(): (wave: WaveHeader) => string {
    const t = useTranslations("Waves");
    return wave => wave.waveLabel ?? t("unlabelledWave");
}
