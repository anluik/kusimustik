"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { CategoryChart } from "@/components/results/category-chart";
import { ChartSwitcher } from "@/components/results/chart-switcher";
import { MatrixChart } from "@/components/results/matrix-chart";
import { NpsBands } from "@/components/results/nps-bands";
import { RampBarChart, RampStackedBar } from "@/components/results/ramp-chart";
import { TextResponses } from "@/components/results/text-responses";
import { LABEL, META, PANEL_HEAD, TAG } from "@/components/results/type";
import { useElementTypeName } from "@/components/builder/element-type";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { assertNever } from "@/domain/assert-never";
import type {
    CategoricalSummary,
    MatrixSummary,
    NpsSummary,
    NumericSummary,
    QuestionSummary,
    TextSummary
} from "@/domain/aggregate";
import {
    chartKindsFor,
    defaultChartKind,
    supportsChartKind
} from "@/domain/charts";
import type { ChartDataShape, ChartKind } from "@/domain/charts";
import type { AnswerableQuestion } from "@/domain/question";
import {
    toCategoryBars,
    toMatrixSeries,
    toRampBars
} from "@/lib/results/chart-data";
import { cn } from "@/lib/utils";

/**
 * One question's card.
 *
 * Two exhaustive switches meet here, and both are the point. The outer one is
 * over `QuestionSummary["kind"]` — a sixth summary shape has to be given a
 * card. The inner ones are over `ChartKind` — a new encoding has to be drawn,
 * or explicitly declared not to apply to that summary.
 *
 * Which kinds the switcher offers is `chartKindsFor`'s answer, never this
 * component's (docs/DECISIONS.md 017). The chosen kind is re-checked against
 * the question on every render, so an edit that adds a sixth option withdraws
 * the vertical bars the owner had selected rather than drawing something
 * DESIGN §7 forbids.
 */

/** MVP charts one wave at a time; wave comparison is after-MVP item 2. */
const SHAPE: ChartDataShape = "single_wave";

export function QuestionCard({
    question,
    summary,
    position
}: {
    readonly question: AnswerableQuestion;
    readonly summary: QuestionSummary;
    /** The question's number in the document, for the card's label. */
    readonly position: number;
}) {
    const t = useTranslations("Results.question");
    const format = useFormatter();
    const typeName = useElementTypeName();

    const kinds = chartKindsFor(question, SHAPE);
    const [chosen, setChosen] = useState<ChartKind | null>(null);

    // The owner's choice only holds while the question still supports it.
    const kind =
        chosen !== null && supportsChartKind(question, SHAPE, chosen)
            ? chosen
            : defaultChartKind(question, SHAPE);

    return (
        <Card
            id={`question-${question.id}`}
            className="scroll-mt-16 gap-3 rounded px-3.5 py-3"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={cn(LABEL, "text-muted-foreground")}>
                        {format.number(position)}
                    </span>
                    <h3 className={PANEL_HEAD}>{question.title}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="secondary"
                            className={cn(TAG, "h-4 rounded px-1")}
                        >
                            {typeName(question.type)}
                        </Badge>
                        <span className={cn(META, "text-muted-foreground")}>
                            {t("answered", { count: summary.answeredCount })}
                        </span>
                        {summary.skippedCount > 0 && (
                            <span className={cn(META, "text-muted-foreground")}>
                                {t("skipped", { count: summary.skippedCount })}
                            </span>
                        )}
                        {/* Sits with the rest of the accounting rather than
                            under the chart: it is the line that makes the
                            three numbers add up, and it is only ever there
                            because the author edited the question after the
                            answers arrived. The answers themselves are still
                            in the table and the CSV. */}
                        {summary.unshownCount > 0 && (
                            <span className={cn(META, "text-muted-foreground")}>
                                {t("unshown", { count: summary.unshownCount })}
                            </span>
                        )}
                    </div>
                </div>

                <ChartSwitcher
                    kinds={kinds}
                    value={kind ?? kinds[0] ?? "bar_horizontal"}
                    onChange={setChosen}
                />
            </div>

            {summary.answeredCount === 0 && summary.kind !== "text" ? (
                // A chart of nothing is worse than a sentence saying so: an
                // empty axis reads as a rendering failure.
                <p className="text-xs leading-[1.35] text-muted-foreground">
                    {t("noAnswers")}
                </p>
            ) : (
                <SummaryBody summary={summary} kind={kind} />
            )}
        </Card>
    );
}

function SummaryBody({
    summary,
    kind
}: {
    readonly summary: QuestionSummary;
    readonly kind: ChartKind | null;
}) {
    switch (summary.kind) {
        case "categorical":
            return <CategoricalBody summary={summary} kind={kind} />;
        case "numeric":
            return <NumericBody summary={summary} kind={kind} />;
        case "nps":
            return <NpsBody summary={summary} kind={kind} />;
        case "text":
            return <TextBody summary={summary} />;
        case "matrix":
            return <MatrixBody summary={summary} kind={kind} />;
        default:
            return assertNever(summary, "summary kind");
    }
}

function CategoricalBody({
    summary,
    kind
}: {
    readonly summary: CategoricalSummary;
    readonly kind: ChartKind | null;
}) {
    const t = useTranslations("Results.question");

    const chart = () => {
        switch (kind) {
            case "bar_horizontal":
                return (
                    <CategoryChart
                        bars={toCategoryBars(summary)}
                        orientation="horizontal"
                    />
                );
            case "bar_vertical":
                return (
                    <CategoryChart
                        bars={toCategoryBars(summary)}
                        orientation="vertical"
                    />
                );
            // The ramp is for ordered data and a line needs a series, so
            // `chartKindsFor` never offers any of these for a choice question.
            // Listed one by one rather than defaulted: a tenth encoding must
            // fail the build here too, not fall through to the bars.
            case "ramp_bar":
            case "ramp_stacked":
            case "line":
            case null:
                return null;
            default:
                return assertNever(kind, "chart kind");
        }
    };

    return (
        <div className="flex flex-col gap-3">
            {chart()}
            {/* Free text typed into an "other" option is an answer, not a
                category, and the bar only says how many chose it. */}
            {summary.other !== null && summary.other.responses.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className={cn(LABEL, "text-muted-foreground")}>
                        {t("otherResponses")}
                    </span>
                    <TextResponses responses={summary.other.responses} />
                </div>
            )}
        </div>
    );
}

function NumericBody({
    summary,
    kind
}: {
    readonly summary: NumericSummary;
    readonly kind: ChartKind | null;
}) {
    const bars = toRampBars(summary);

    switch (kind) {
        case "ramp_bar":
            return (
                <div className="flex flex-col gap-3">
                    <RampBarChart
                        bars={bars}
                        minLabel={summary.minLabel}
                        maxLabel={summary.maxLabel}
                    />
                    <Averages mean={summary.mean} median={summary.median} />
                </div>
            );
        case "ramp_stacked":
            return (
                <div className="flex flex-col gap-3">
                    <RampStackedBar bars={bars} ariaLabel={summary.title} />
                    <Averages mean={summary.mean} median={summary.median} />
                </div>
            );
        // Categorical bars would put an ordered scale on the categorical
        // palette, which §7 forbids; a line needs a series.
        case "bar_horizontal":
        case "bar_vertical":
        case "line":
        case null:
            return null;
        default:
            return assertNever(kind, "chart kind");
    }
}

function NpsBody({
    summary,
    kind
}: {
    readonly summary: NpsSummary;
    readonly kind: ChartKind | null;
}) {
    const bars = toRampBars(summary);

    // The bands and the score are shown whichever encoding is chosen: they are
    // what an NPS question is for, and the distribution is the detail beneath.
    const distribution = () => {
        switch (kind) {
            case "ramp_bar":
                return (
                    <RampBarChart bars={bars} minLabel={null} maxLabel={null} />
                );
            case "ramp_stacked":
                return <RampStackedBar bars={bars} ariaLabel={summary.title} />;
            case "bar_horizontal":
            case "bar_vertical":
            case "line":
            case null:
                return null;
            default:
                return assertNever(kind, "chart kind");
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <NpsBands summary={summary} />
            {distribution()}
        </div>
    );
}

function TextBody({ summary }: { readonly summary: TextSummary }) {
    // No switch: `chartKindsFor` returns nothing for a text question, so there
    // is no encoding to choose between and no switcher on the card either.
    return <TextResponses responses={summary.responses} />;
}

function MatrixBody({
    summary,
    kind
}: {
    readonly summary: MatrixSummary;
    readonly kind: ChartKind | null;
}) {
    const rows = toMatrixSeries(summary);

    switch (kind) {
        case "ramp_bar":
            return <MatrixChart rows={rows} variant="bars" />;
        case "ramp_stacked":
            return <MatrixChart rows={rows} variant="stacked" />;
        case "bar_horizontal":
        case "bar_vertical":
        case "line":
        case null:
            return null;
        default:
            return assertNever(kind, "chart kind");
    }
}

function Averages({
    mean,
    median
}: {
    readonly mean: number | null;
    readonly median: number | null;
}) {
    const t = useTranslations("Results.numeric");
    const format = useFormatter();

    if (mean === null && median === null) return null;

    return (
        <div className={cn(META, "flex gap-4 text-muted-foreground")}>
            {mean !== null && (
                <span>
                    {t("mean")}{" "}
                    <span className="text-foreground">
                        {format.number(mean, { maximumFractionDigits: 2 })}
                    </span>
                </span>
            )}
            {median !== null && (
                <span>
                    {t("median")}{" "}
                    <span className="text-foreground">
                        {format.number(median, { maximumFractionDigits: 2 })}
                    </span>
                </span>
            )}
        </div>
    );
}
