"use client";

import { useFormatter, useTranslations } from "next-intl";

import { LABEL, META, METRIC } from "@/components/results/type";
import type { NpsSummary } from "@/domain/aggregate";
import { barWidth } from "@/lib/results/chart-data";
import { cn } from "@/lib/utils";

/**
 * NPS's own figures: the score and the three-band split.
 *
 * `NpsSummary` is a separate summary kind rather than a flagged
 * `NumericSummary` precisely so this can exist (docs/DECISIONS.md 007) — the
 * score is not a mean and the bands are not a distribution, and folding them
 * into the numeric card would have made every numeric chart branch on whether
 * they were present.
 *
 * The three bands use `--chart-1` … `--chart-3` rather than the ramp: they are
 * three named groups, not positions on a scale. The band is also always named
 * in text beside its bar, so the colour is never the only encoding (§10).
 */
export function NpsBands({ summary }: { readonly summary: NpsSummary }) {
    const t = useTranslations("Results.nps");
    const format = useFormatter();

    const total = summary.answeredCount;
    const bands = [
        {
            key: "detractors",
            label: t("detractors"),
            count: summary.detractors,
            fill: "var(--chart-3)"
        },
        {
            key: "passives",
            label: t("passives"),
            count: summary.passives,
            fill: "var(--chart-2)"
        },
        {
            key: "promoters",
            label: t("promoters"),
            count: summary.promoters,
            fill: "var(--chart-1)"
        }
    ];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                    <span className={cn(LABEL, "text-muted-foreground")}>
                        {t("score")}
                    </span>
                    <span className={METRIC}>
                        {summary.score === null
                            ? "—"
                            : format.number(summary.score, {
                                  maximumFractionDigits: 1,
                                  signDisplay: "exceptZero"
                              })}
                    </span>
                </div>
            </div>

            <div className="flex h-8 w-full overflow-hidden rounded border">
                {bands
                    .filter(band => band.count > 0)
                    .map(band => (
                        <div
                            key={band.key}
                            style={{
                                width: barWidth(share(band.count, total)),
                                background: band.fill
                            }}
                            className="border-r border-border/60 last:border-r-0"
                        />
                    ))}
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {bands.map(band => (
                    <li
                        key={band.key}
                        className={cn(META, "flex items-center gap-1.5")}
                    >
                        <span
                            aria-hidden
                            style={{ background: band.fill }}
                            className="inline-block h-2.5 w-4 rounded-xs border"
                        />
                        <span className="text-muted-foreground">
                            {band.label}
                        </span>
                        <span>{format.number(band.count)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function share(count: number, total: number): number {
    return total === 0 ? 0 : (count / total) * 100;
}
