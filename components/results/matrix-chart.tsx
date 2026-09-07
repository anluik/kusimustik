"use client";

import { useFormatter, useTranslations } from "next-intl";

import { META } from "@/components/results/type";
import { barWidth } from "@/lib/results/chart-data";
import type { MatrixRowSeries } from "@/lib/results/chart-data";
import { rampFill, rampLabelColor } from "@/lib/results/ramp";
import { cn } from "@/lib/utils";

/**
 * A matrix question: one row per matrix row, columns encoded on the ramp.
 *
 * Both variants share a legend, because the columns are the same sequence in
 * every row and repeating it per row would be six legends for one scale.
 *
 * `ramp_bar` draws each row's columns as separate bars — the shape to compare
 * *within* a row. `ramp_stacked` draws each row as one full-width bar — the
 * shape to compare *between* rows, which is the usual Likert reading.
 */
export function MatrixChart({
    rows,
    variant
}: {
    readonly rows: readonly MatrixRowSeries[];
    readonly variant: "bars" | "stacked";
}) {
    const t = useTranslations("Results.matrix");
    const format = useFormatter();

    // The legend's steps come from a row's segments rather than being computed
    // again here, so the swatch and the bar cannot disagree about a column.
    const legend = rows[0]?.segments ?? [];

    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {legend.map(segment => (
                    <li
                        key={segment.key}
                        className={cn(
                            META,
                            "flex items-center gap-1.5 text-muted-foreground"
                        )}
                    >
                        <span
                            aria-hidden
                            style={{ background: rampFill(segment.step) }}
                            className="inline-block h-2.5 w-4 rounded-xs border"
                        />
                        {segment.label}
                    </li>
                ))}
            </ul>

            <div className="flex flex-col gap-3">
                {rows.map(row => (
                    <div key={row.key} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs leading-none">
                                {row.label}
                            </span>
                            <span className={cn(META, "text-muted-foreground")}>
                                {t("answered", {
                                    count: format.number(row.answeredCount)
                                })}
                            </span>
                        </div>

                        {variant === "stacked" ? (
                            <div className="flex h-8 w-full overflow-hidden rounded border">
                                {row.segments
                                    .filter(segment => segment.count > 0)
                                    .map(segment => (
                                        <div
                                            key={segment.key}
                                            style={{
                                                width: barWidth(
                                                    segment.percentage
                                                ),
                                                background: rampFill(
                                                    segment.step
                                                ),
                                                color: rampLabelColor(
                                                    segment.step
                                                )
                                            }}
                                            className="flex min-w-0 items-center justify-center border-r border-border/60 font-mono text-[10px] leading-none tabular-nums last:border-r-0"
                                            title={`${segment.label}: ${segment.count}`}
                                        >
                                            <span className="truncate px-1">
                                                {segment.count}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-px">
                                {row.segments.map(segment => (
                                    <div
                                        key={segment.key}
                                        className="flex items-center gap-2"
                                    >
                                        <span
                                            className={cn(
                                                META,
                                                "w-24 shrink-0 truncate text-muted-foreground"
                                            )}
                                        >
                                            {segment.label}
                                        </span>
                                        {/* The track makes an empty column
                                            visible as an empty column rather
                                            than as nothing at all. */}
                                        <span className="h-4 min-w-0 flex-1 rounded-xs bg-ramp-track">
                                            <span
                                                className="block h-full rounded-xs border"
                                                style={{
                                                    width: barWidth(
                                                        segment.percentage
                                                    ),
                                                    background: rampFill(
                                                        segment.step
                                                    )
                                                }}
                                            />
                                        </span>
                                        <span
                                            className={cn(
                                                META,
                                                "w-8 shrink-0 text-right"
                                            )}
                                        >
                                            {format.number(segment.count)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
