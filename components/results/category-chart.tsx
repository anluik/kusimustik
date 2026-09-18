"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";

import { META } from "@/components/type";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { CategoryBar } from "@/lib/results/chart-data";
import { cn } from "@/lib/utils";

/**
 * Categorical bars, horizontal or vertical.
 *
 * The ordering, the fills and the top-seven aggregation all happened in
 * `toCategoryBars` — DESIGN §7's rules are data, not presentation, so a chart
 * cannot quietly grow a sixth colour by editing this file. What is left here
 * is geometry and labelling.
 *
 * §7: horizontal bars are directly labelled with name and value, and the
 * vertical variant only ever arrives with five or fewer short labels (see
 * `chartKindsFor`), so neither needs a rotated axis.
 */

/** DESIGN §4: rows are 32px in owner surfaces; a bar plus its gap. */
const ROW_HEIGHT = 32;
const MIN_HEIGHT = 96;

/**
 * §7: a bar encodes its value by length, and length is only readable against
 * a stable baseline of comparison. Unbounded, three categories on a 3440px
 * monitor became three 2-metre bands whose relative lengths were harder to
 * judge than at half the width, and the value labels ended up a screen away
 * from their names.
 */
const PLOT = "w-full max-w-[720px]";

/** A rounded data end, anchored to the baseline (the bar's own corner). */
const END_RADIUS = 4;

export function CategoryChart({
    bars,
    orientation
}: {
    readonly bars: readonly CategoryBar[];
    readonly orientation: "horizontal" | "vertical";
}) {
    const t = useTranslations("Results.chart");

    // The aggregate bar's label is owner-facing copy and comes from the
    // catalogue; `toCategoryBars` deliberately leaves it blank.
    const data = bars.map(bar => ({
        ...bar,
        label:
            bar.kind === "overflow"
                ? t("overflow", { count: bar.contains.length })
                : bar.label
    }));

    const config = {
        count: { label: t("count") }
    } satisfies ChartConfig;

    if (orientation === "vertical") {
        return (
            <ChartContainer config={config} className={cn("h-[200px]", PLOT)}>
                <BarChart data={data} margin={{ top: 16, bottom: 0 }}>
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className={META}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                        dataKey="count"
                        radius={[END_RADIUS, END_RADIUS, 0, 0]}
                        maxBarSize={28}
                        isAnimationActive={false}
                    >
                        {data.map(bar => (
                            <Cell key={bar.key} fill={bar.fill} />
                        ))}
                        <LabelList
                            dataKey="count"
                            position="top"
                            offset={6}
                            className={cn(META, "fill-foreground")}
                        />
                    </Bar>
                </BarChart>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer
            config={config}
            className={PLOT}
            style={{
                height: `${Math.max(data.length * ROW_HEIGHT + 16, MIN_HEIGHT)}px`
            }}
        >
            <BarChart
                data={data}
                layout="vertical"
                margin={{ left: 0, right: 32 }}
            >
                <YAxis
                    dataKey="label"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={140}
                    className={META}
                />
                <XAxis dataKey="count" type="number" hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                    dataKey="count"
                    radius={[0, END_RADIUS, END_RADIUS, 0]}
                    maxBarSize={18}
                    isAnimationActive={false}
                >
                    {data.map(bar => (
                        <Cell key={bar.key} fill={bar.fill} />
                    ))}
                    {/* Outside the fill: the value then needs no contrast
                        flip, and an empty bar still shows its nought. */}
                    <LabelList
                        dataKey="count"
                        position="right"
                        offset={6}
                        className={cn(META, "fill-foreground")}
                    />
                </Bar>
            </BarChart>
        </ChartContainer>
    );
}
