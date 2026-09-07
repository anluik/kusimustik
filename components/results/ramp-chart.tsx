"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts";

import { META } from "@/components/results/type";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { barWidth } from "@/lib/results/chart-data";
import type { RampBar } from "@/lib/results/chart-data";
import { rampFill, rampLabelColor } from "@/lib/results/ramp";
import { cn } from "@/lib/utils";

/**
 * Ordered distributions: one bar per step of the scale.
 *
 * DESIGN §7 requires two things of every ramp fill and both are load-bearing:
 * a 1px `--border` stroke, because steps 1-4 fall below 3:1 on `--card` and an
 * isolated low bar would otherwise vanish; and the ramp encoding *position*,
 * never health — a low score is not coloured as a problem.
 */

export function RampBarChart({
    bars,
    minLabel,
    maxLabel
}: {
    readonly bars: readonly RampBar[];
    readonly minLabel: string | null;
    readonly maxLabel: string | null;
}) {
    const t = useTranslations("Results.chart");

    const data = bars.map(bar => ({
        ...bar,
        fill: rampFill(bar.step)
    }));

    const config = { count: { label: t("count") } } satisfies ChartConfig;

    return (
        <div className="flex flex-col gap-2">
            <ChartContainer config={config} className="h-[180px] w-full">
                <BarChart data={data} margin={{ top: 16, bottom: 0 }}>
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className={META}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={2} isAnimationActive={false}>
                        {data.map(bar => (
                            <Cell
                                key={bar.key}
                                fill={bar.fill}
                                // §7: not optional. Without it the pale steps
                                // disappear against the card.
                                stroke="var(--border)"
                                strokeWidth={1}
                            />
                        ))}
                        <LabelList
                            dataKey="count"
                            position="top"
                            offset={6}
                            className="fill-foreground font-mono text-[11px]"
                        />
                    </Bar>
                </BarChart>
            </ChartContainer>

            {(minLabel !== null || maxLabel !== null) && (
                <div
                    className={cn(
                        META,
                        "flex justify-between text-muted-foreground"
                    )}
                >
                    <span>{minLabel ?? ""}</span>
                    <span>{maxLabel ?? ""}</span>
                </div>
            )}
        </div>
    );
}

/**
 * The same distribution as one bar split into segments — the shape of the
 * whole answer at a glance, and the only place a value label has nowhere to go
 * but on the fill. `rampLabelColor` is what keeps it legible in both themes;
 * see §7 and `lib/results/ramp.ts`.
 *
 * Hand-built rather than Recharts: it is one bar, and a stacked Recharts series
 * would need one `<Bar>` per step with a shared datum, which is more machinery
 * than a flex row.
 */
export function RampStackedBar({
    bars,
    ariaLabel
}: {
    readonly bars: readonly RampBar[];
    readonly ariaLabel: string;
}) {
    const format = useFormatter();
    const visible = bars.filter(bar => bar.count > 0);

    return (
        <div className="flex flex-col gap-2">
            <div
                role="img"
                aria-label={ariaLabel}
                className="flex h-10 w-full overflow-hidden rounded border"
            >
                {visible.map(bar => (
                    <div
                        key={bar.key}
                        // DESIGN §7: a dot decimal. A locale-formatted number
                        // here is invalid CSS and is dropped silently.
                        style={{
                            width: barWidth(bar.percentage),
                            background: rampFill(bar.step),
                            color: rampLabelColor(bar.step)
                        }}
                        className="flex min-w-0 items-center justify-center border-r border-border/60 font-mono text-[10px] leading-none tabular-nums last:border-r-0"
                    >
                        <span className="truncate px-1">{bar.label}</span>
                    </div>
                ))}
            </div>

            <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {visible.map(bar => (
                    <li
                        key={bar.key}
                        className={cn(
                            META,
                            "flex items-center gap-1.5 text-muted-foreground"
                        )}
                    >
                        <span
                            aria-hidden
                            style={{ background: rampFill(bar.step) }}
                            className="inline-block h-2.5 w-4 rounded-xs border"
                        />
                        <span>{bar.label}</span>
                        <span className="text-foreground">
                            {format.number(bar.count)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
