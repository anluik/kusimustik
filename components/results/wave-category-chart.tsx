"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { META } from "@/components/results/type";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { WaveCategoryRow } from "@/lib/results/wave-chart-data";

/**
 * One choice question's options across the waves: a bar per wave per option.
 *
 * Here the **wave** is the category, so DESIGN §7's five-colour cap is a cap on
 * waves — which is what `MAX_COMPARED_WAVES` enforces upstream, so this
 * component never has a sixth series to colour.
 *
 * The values are shares, not counts (`toWaveCategoryRows`), because waves
 * collect different numbers of responses and a taller bar must mean a larger
 * share rather than a busier year. The axis therefore runs 0–100 and is
 * labelled, rather than each bar being labelled directly: at up to five bars
 * per option there is no room for five numbers between the rows, and §7's
 * direct-labelling rule was written for the single-series chart.
 *
 * A wave that did not ask the question contributes `null` and Recharts draws
 * nothing — no bar at all, which is the point. A nought would say the option
 * was offered and nobody took it.
 */

/** DESIGN §4: an owner-surface row, per bar. */
const BAR_HEIGHT = 18;
const ROW_GAP = 14;
const MIN_HEIGHT = 120;

export type WaveSeries = {
    /** Stable across renders; the wave's survey id. */
    readonly key: string;
    readonly label: string;
    /** A `var(--chart-n)` reference — never a literal. */
    readonly fill: string;
};

export function WaveCategoryChart({
    rows,
    waves,
    orientation
}: {
    readonly rows: readonly WaveCategoryRow[];
    readonly waves: readonly WaveSeries[];
    readonly orientation: "horizontal" | "vertical";
}) {
    const t = useTranslations("Waves.chart");
    const format = useFormatter();

    // Recharts reads its series off object keys, so each wave gets a positional
    // one. The wave's own label lives in the config, which is what the legend
    // and the tooltip read.
    const data = rows.map(row => ({
        label: row.label,
        ...Object.fromEntries(
            waves.map((_, index) => [
                seriesKey(index),
                row.values[index] ?? null
            ])
        )
    }));

    const config = Object.fromEntries(
        waves.map((series, index) => [
            seriesKey(index),
            { label: series.label, color: series.fill }
        ])
    ) satisfies ChartConfig;

    const share = (value: number) =>
        `${format.number(value, { maximumFractionDigits: 1 })}%`;

    /** The tooltip shows shares too: a bare number would read as a count. */
    const tooltip = (value: unknown, name: unknown) => (
        <>
            <span className="text-muted-foreground">
                {config[String(name)]?.label ?? t("wave")}
            </span>
            <span className="ml-auto font-mono tabular-nums">
                {typeof value === "number" ? share(value) : "—"}
            </span>
        </>
    );

    const bars = waves.map((series, index) => (
        <Bar
            key={series.key}
            dataKey={seriesKey(index)}
            fill={`var(--color-${seriesKey(index)})`}
            radius={2}
            isAnimationActive={false}
        />
    ));

    if (orientation === "vertical") {
        return (
            <ChartContainer config={config} className="h-[220px] w-full">
                <BarChart data={data} margin={{ top: 8 }}>
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className={META}
                    />
                    <YAxis
                        type="number"
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickFormatter={share}
                        className={META}
                    />
                    <ChartTooltip
                        content={<ChartTooltipContent formatter={tooltip} />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {bars}
                </BarChart>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer
            config={config}
            className="w-full"
            style={{
                height: `${Math.max(
                    rows.length * (waves.length * BAR_HEIGHT + ROW_GAP) + 48,
                    MIN_HEIGHT
                )}px`
            }}
        >
            <BarChart data={data} layout="vertical" margin={{ right: 12 }}>
                <YAxis
                    dataKey="label"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={140}
                    className={META}
                />
                <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={share}
                    className={META}
                />
                <ChartTooltip
                    content={<ChartTooltipContent formatter={tooltip} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {bars}
            </BarChart>
        </ChartContainer>
    );
}

function seriesKey(index: number): string {
    return `w${index}`;
}
