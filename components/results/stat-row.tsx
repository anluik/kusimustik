"use client";

import { useFormatter, useTranslations } from "next-intl";

import { StatCard } from "@/components/results/stat-card";
import { TAG } from "@/components/results/type";
import type { SurveyId } from "@/domain/ids";
import { useLiveResponseCount } from "@/hooks/use-live-response-count";
import type { FunnelTotals } from "@/lib/db/funnel";
import { completionRate } from "@/lib/results/funnel";
import { cn } from "@/lib/utils";

/**
 * The four figures above the tabs: how many answered, how many of those who
 * started finished, how many opened the link, and how long a question takes.
 *
 * The response count is live (see `useLiveResponseCount`); the rest are not.
 * A completion rate that moved under the owner's eye without the funnel below
 * it moving too would be worse than one that waits for a reload.
 */
export function StatRow({
    surveyId,
    responseCount,
    totals,
    medianDwellMs
}: {
    readonly surveyId: SurveyId;
    readonly responseCount: number;
    readonly totals: FunnelTotals;
    /** Median across all questions, or null where nothing was measured. */
    readonly medianDwellMs: number | null;
}) {
    const t = useTranslations("Results.stats");
    const format = useFormatter();

    const live = useLiveResponseCount(surveyId, responseCount);
    const completion = completionRate(totals);

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
                label={t("responses")}
                value={format.number(live)}
                hint={t("responsesHint")}
                badge={
                    // Only claimed once a submission has actually arrived over
                    // the socket: a badge that says "live" on a page whose
                    // subscription silently failed is a lie the owner cannot
                    // check.
                    live > responseCount ? (
                        <span
                            className={cn(
                                TAG,
                                "flex items-center gap-1 text-muted-foreground"
                            )}
                        >
                            <span
                                aria-hidden
                                className="size-1.5 rounded-full bg-primary"
                            />
                            {t("live")}
                        </span>
                    ) : undefined
                }
            />
            <StatCard
                label={t("completionRate")}
                value={
                    completion === null
                        ? t("unknown")
                        : format.number(completion / 100, {
                              style: "percent",
                              maximumFractionDigits: 1
                          })
                }
                hint={
                    completion === null
                        ? t("unknownHint")
                        : t("completionRateHint")
                }
            />
            <StatCard
                label={t("views")}
                value={
                    totals.views === 0
                        ? t("unknown")
                        : format.number(totals.views)
                }
                hint={totals.views === 0 ? t("unknownHint") : t("viewsHint")}
            />
            <StatCard
                label={t("medianTime")}
                value={
                    medianDwellMs === null
                        ? t("unknown")
                        : format.number(medianDwellMs / 1000, {
                              maximumFractionDigits: 1,
                              style: "unit",
                              unit: "second",
                              unitDisplay: "narrow"
                          })
                }
                hint={
                    medianDwellMs === null
                        ? t("unknownHint")
                        : t("medianTimeHint")
                }
            />
        </div>
    );
}
