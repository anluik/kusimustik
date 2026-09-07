"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";

import { META, PANEL_HEAD } from "@/components/results/type";
import { Card } from "@/components/ui/card";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { FunnelStage } from "@/lib/results/funnel";
import { rampFill, rampStep } from "@/lib/results/ramp";
import { cn } from "@/lib/utils";

/**
 * Median time per question.
 *
 * DESIGN §5 names this one explicitly as Recharts — a `BarChart
 * layout="vertical"` through `ChartContainer` — unlike the funnel beside it,
 * which is hand-built. The difference is that this is one measurement per
 * question with no flag column, which is what Recharts is good at.
 *
 * The ramp runs in document order, not by duration: §7 again — position in the
 * sequence, never health. A slow question is read off the bar's length.
 */
const ROW_HEIGHT = 32;
const MIN_HEIGHT = 120;

export function DwellChart({
    stages
}: {
    readonly stages: readonly FunnelStage[];
}) {
    const t = useTranslations("Results.funnel.medianTime");
    const format = useFormatter();

    const measured = stages.filter(
        stage => stage.kind === "question" && stage.medianDwellMs !== null
    );

    // Nothing measured is not an error and not an empty state for the whole
    // tab — the funnel above it is still worth reading — so the panel simply
    // is not there.
    if (measured.length === 0) return null;

    const data = measured.map((stage, index) => ({
        key: stage.id,
        label: stage.title ?? "",
        seconds: Math.round(((stage.medianDwellMs ?? 0) / 1000) * 10) / 10,
        step: rampStep(index, measured.length)
    }));

    const config = { seconds: { label: t("title") } } satisfies ChartConfig;

    return (
        <Card className="gap-3 rounded px-3.5 py-3">
            <div className="flex flex-col gap-1">
                <h3 className={PANEL_HEAD}>{t("title")}</h3>
                <p className={cn(META, "text-muted-foreground")}>{t("hint")}</p>
            </div>

            <ChartContainer
                config={config}
                className="w-full"
                style={{
                    height: `${Math.max(data.length * ROW_HEIGHT + 16, MIN_HEIGHT)}px`
                }}
            >
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ left: 0, right: 40 }}
                >
                    <YAxis
                        dataKey="label"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={160}
                        className={META}
                    />
                    <XAxis dataKey="seconds" type="number" hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="seconds" radius={2} isAnimationActive={false}>
                        {data.map(row => (
                            <Cell
                                key={row.key}
                                fill={rampFill(row.step)}
                                // §7: every ramp fill carries this stroke.
                                stroke="var(--border)"
                                strokeWidth={1}
                            />
                        ))}
                        {/* Recharts hands the formatter its own renderable
                            text type, which includes `undefined` for a datum
                            it could not read; the guard is what keeps the unit
                            off a label that has no number. */}
                        <LabelList
                            dataKey="seconds"
                            position="right"
                            offset={6}
                            className="fill-foreground font-mono text-[11px]"
                            formatter={(value: unknown) =>
                                typeof value === "number"
                                    ? t("seconds", {
                                          value: format.number(value, {
                                              maximumFractionDigits: 1
                                          })
                                      })
                                    : ""
                            }
                        />
                    </Bar>
                </BarChart>
            </ChartContainer>
        </Card>
    );
}
