"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { META } from "@/components/results/type";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { WaveTrend } from "@/lib/results/wave-chart-data";

/**
 * The trend: waves along the axis, one line per series.
 *
 * This is the encoding `CHART_DATA_SHAPES` was written for and the reason
 * `line` has been in `CHART_KINDS` since Phase 7 without a call site. DESIGN §7
 * permits it for a value tracked over time, and time is exactly what the wave
 * axis is.
 *
 * `connectNulls` is off, deliberately. A wave that did not ask the question is
 * a hole in the series, and a line drawn straight through it would assert a
 * measurement nobody took.
 *
 * A single-series trend — a scale's mean, an NPS score — follows §7's
 * single-series rule: `--chart-1`, and no legend, because there is nothing to
 * tell apart.
 */
export function WaveTrendChart({
    trend,
    waveLabels,
    metricLabel
}: {
    readonly trend: WaveTrend;
    /** One per compared wave, oldest first — the x axis. */
    readonly waveLabels: readonly string[];
    /** Names the value when there is one line and so no legend. */
    readonly metricLabel: string;
}) {
    const t = useTranslations("Waves.chart");
    const format = useFormatter();

    const single = trend.series.length === 1;

    const data = waveLabels.map((label, wave) => ({
        label,
        ...Object.fromEntries(
            trend.series.map((series, index) => [
                seriesKey(index),
                series.points[wave] ?? null
            ])
        )
    }));

    const config = Object.fromEntries(
        trend.series.map((series, index) => [
            seriesKey(index),
            {
                label: single ? metricLabel : series.label,
                color: series.fill
            }
        ])
    ) satisfies ChartConfig;

    const value = (given: number) =>
        trend.unit === "percent"
            ? `${format.number(given, { maximumFractionDigits: 1 })}%`
            : format.number(given, { maximumFractionDigits: 2 });

    const tooltip = (given: unknown, name: unknown) => (
        <>
            <span className="text-muted-foreground">
                {config[String(name)]?.label ?? t("value")}
            </span>
            <span className="ml-auto font-mono tabular-nums">
                {typeof given === "number" ? value(given) : "—"}
            </span>
        </>
    );

    return (
        <ChartContainer config={config} className="h-[220px] w-full">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className={META}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={value}
                    className={META}
                    {...(trend.unit === "percent" && {
                        domain: [0, 100] as const
                    })}
                />
                <ChartTooltip
                    content={<ChartTooltipContent formatter={tooltip} />}
                />
                {!single && <ChartLegend content={<ChartLegendContent />} />}
                {trend.series.map((series, index) => (
                    <Line
                        key={series.key}
                        dataKey={seriesKey(index)}
                        type="linear"
                        stroke={`var(--color-${seriesKey(index)})`}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        // A gap is a wave that did not ask. Joining across it
                        // would draw a measurement that was never taken.
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        </ChartContainer>
    );
}

function seriesKey(index: number): string {
    return `s${index}`;
}
