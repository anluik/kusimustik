"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useWaveName } from "@/components/comparisons/wave-name";
import { ChartSwitcher } from "@/components/results/chart-switcher";
import { SummaryBody } from "@/components/results/question-card";
import { LABEL, META, QUESTION, TAG } from "@/components/type";
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
import type { ComparedRow, WaveHeader } from "@/lib/results/wave-comparison";
import { cn } from "@/lib/utils";

/**
 * One row of a saved comparison: the questions the owner matched, across the
 * waves (docs/DECISIONS.md 035).
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
 * A wave the row holds nothing from, one whose question stopped satisfying the
 * row, and one whose question was removed after it was answered are each
 * named above the chart rather than left as a hole the owner has to notice —
 * the same reasoning as `unshownCount` on the single-wave card (DECISIONS 021).
 * A suggested row the owner has not confirmed says so, so a fresh comparison
 * never passes for a reviewed one.
 */

const SHAPE: ChartDataShape = "series";

export function WaveQuestionCard({
    row,
    waves,
    position
}: {
    readonly row: ComparedRow;
    readonly waves: readonly WaveHeader[];
    readonly position: number;
}) {
    const t = useTranslations("Waves.question");
    const tChart = useTranslations("Waves.chart");
    const format = useFormatter();
    const typeName = useElementTypeName();
    const waveName = useWaveName();

    const kinds = chartKindsFor(row.question, SHAPE);
    const [chosen, setChosen] = useState<ChartKind | null>(null);

    // The owner's choice only holds while the question still supports it — an
    // edit between waves can withdraw an encoding.
    const kind =
        chosen !== null && supportsChartKind(row.question, SHAPE, chosen)
            ? chosen
            : defaultChartKind(row.question, SHAPE);

    const series: readonly WaveSeries[] = waves.map((wave, index) => ({
        key: wave.surveyId,
        label: waveName(wave),
        fill: `var(--chart-${index + 1})`
    }));

    const answered = row.cells.reduce(
        (total, cell) =>
            total +
            (cell.state === "compared" ? cell.summary.answeredCount : 0),
        0
    );

    const inState = (predicate: (index: number) => boolean) =>
        waves.filter((_, index) => predicate(index)).map(waveName);
    const notMatched = inState(
        index => row.cells[index]?.state === "notMatched"
    );
    const notComparable = inState(
        index => row.cells[index]?.state === "mismatched"
    );
    const removed = inState(index => {
        const cell = row.cells[index];
        return cell?.state === "compared" && cell.removed;
    });
    const notes = [
        ...(notMatched.length > 0
            ? [t("notMatched", { waves: notMatched.join(", ") })]
            : []),
        ...(notComparable.length > 0
            ? [t("notComparable", { waves: notComparable.join(", ") })]
            : []),
        ...(removed.length > 0
            ? [t("removed", { waves: removed.join(", ") })]
            : [])
    ];

    return (
        <Card
            id={`row-${row.id}`}
            className="scroll-mt-16 gap-3.5 rounded-xl px-4 py-3.5"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={cn(LABEL, "tabular-nums")}>
                        {format.number(position)}
                    </span>
                    <h3 className={QUESTION}>{row.question.title}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="secondary"
                            className={cn(TAG, "h-[20px] rounded-full px-2")}
                        >
                            {typeName(row.question.type)}
                        </Badge>
                        <span className={cn(META, "text-muted-foreground")}>
                            {t("comparedWaves", {
                                count: row.comparedCount
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

            {notes.length > 0 && (
                <div className="flex flex-col gap-1">
                    {notes.map(note => (
                        <p
                            key={note}
                            className={cn(META, "text-muted-foreground")}
                        >
                            {note}
                        </p>
                    ))}
                </div>
            )}

            {row.comparedCount === 0 ? (
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
                    row={row}
                    waves={waves}
                    series={series}
                    kind={kind}
                    metricLabel={tChart(
                        row.question.type === "nps" ? "score" : "mean"
                    )}
                />
            )}
        </Card>
    );
}

function ComparisonBody({
    row,
    waves,
    series,
    kind,
    metricLabel
}: {
    readonly row: ComparedRow;
    readonly waves: readonly WaveHeader[];
    readonly series: readonly WaveSeries[];
    readonly kind: ChartKind | null;
    readonly metricLabel: string;
}) {
    const trend = kind === "line" ? toWaveTrend(row) : null;

    switch (kind) {
        case "bar_horizontal":
        case "bar_vertical":
            return (
                <WaveCategoryChart
                    rows={toWaveCategoryRows(row)}
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
                    row={row}
                    waves={waves}
                    kind={defaultChartKind(row.question, SHAPE)}
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
            return <PerWaveBodies row={row} waves={waves} kind={kind} />;

        default:
            return assertNever(kind, "chart kind");
    }
}

/** One block per wave that has something to show, captioned with its label. */
function PerWaveBodies({
    row,
    waves,
    kind
}: {
    readonly row: ComparedRow;
    readonly waves: readonly WaveHeader[];
    readonly kind: ChartKind | null;
}) {
    const t = useTranslations("Waves.question");
    const waveName = useWaveName();

    return (
        <div className="flex flex-col gap-4">
            {row.cells.map((cell, index) => {
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
