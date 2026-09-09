import type { CategoricalSummary, QuestionSummary } from "@/domain/aggregate";
import { assertNever } from "@/domain/assert-never";
import type { ComparedQuestion, WaveCell } from "@/lib/results/wave-comparison";

/**
 * The comparison's chart data: one question's waves, shaped for the charts
 * that draw several waves at once.
 *
 * Everything here is a *share*, never a count. Waves collect different numbers
 * of responses — that is the normal case, not the edge one — so a bar twice as
 * tall because twice as many people answered would be read as a doubled result.
 * Percentages are `aggregate()`'s own, taken against each wave's answered
 * count, so the comparison says the same thing the single-wave card does.
 *
 * A wave that did not ask the question, or asked something else under its key,
 * contributes `null` rather than nought — a gap in the line and no bar at all.
 * Nought is a finding ("nobody chose this"); absence is not.
 *
 * Two of `docs/DESIGN.md` §7's rules read differently here, and the reasons are
 * in docs/DECISIONS.md 029:
 *
 * - **The wave is the category**, so the five-colour cap is a cap on waves —
 *   which is why `MAX_COMPARED_WAVES` is five and this file has five fills.
 * - **Options keep the author's order** rather than sorting descending. Sorted
 *   by which wave? Any answer makes the axis move between waves, and the point
 *   of a comparison is that the rows line up.
 */

/**
 * DESIGN §7: the categorical palette, in order, no skipping, never a sixth.
 *
 * It colours whichever axis is the categorical one — the waves in the grouped
 * bars, the options in the trend lines. Both are capped at five, and both caps
 * are this one.
 */
export const SERIES_FILLS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)"
] as const;

/** The fill for the nth series, in the order it is drawn. */
export function seriesFill(index: number): string {
    return SERIES_FILLS[index % SERIES_FILLS.length] ?? SERIES_FILLS[0];
}

/** The row standing for a question's free-text "other" bucket. */
export const OTHER_ROW = "__other__";

export type WaveCategoryRow = {
    /** The option's stored value — what the waves are matched on. */
    readonly key: string;
    readonly label: string;
    /** One share per compared wave, oldest first; null where not offered. */
    readonly values: readonly (number | null)[];
};

/**
 * One row per option, one value per wave.
 *
 * Options are matched across waves on their stored `value`, for the same reason
 * questions are matched on `key`: the label is the author's wording and gets
 * edited between waves. An option a wave never offered is `null`, not nought,
 * and one a *later* wave added appears after the reference question's own
 * options rather than being dropped.
 */
export function toWaveCategoryRows(
    question: ComparedQuestion
): readonly WaveCategoryRow[] {
    const categorical = question.cells.map(cell =>
        cell.state === "compared" && cell.summary.kind === "categorical"
            ? cell.summary
            : null
    );

    const labels = new Map<string, string>();
    const order: string[] = [];

    // First writer wins, and the reference question writes first: an option is
    // named as the newest wave that offers it names it, and one only an older
    // wave has keeps that wave's wording rather than going unlabelled.
    const note = (value: string, label: string) => {
        if (labels.has(value)) return;
        labels.set(value, label);
        order.push(value);
    };

    for (const option of optionsOf(question)) note(option.value, option.label);
    for (const summary of categorical) {
        if (summary === null) continue;
        for (const option of summary.options) note(option.value, option.label);
        if (summary.other !== null) note(OTHER_ROW, summary.other.label ?? "");
    }

    return order.map(value => ({
        key: value,
        label: labels.get(value) ?? value,
        values: categorical.map(summary => shareOf(summary, value))
    }));
}

function optionsOf(
    question: ComparedQuestion
): readonly { readonly value: string; readonly label: string }[] {
    const reference = question.question;
    switch (reference.type) {
        case "single_choice":
        case "multi_choice":
        case "dropdown":
            return reference.options;
        default:
            return [];
    }
}

function shareOf(
    summary: CategoricalSummary | null,
    value: string
): number | null {
    if (summary === null) return null;
    if (value === OTHER_ROW) return summary.other?.percentage ?? null;
    return (
        summary.options.find(option => option.value === value)?.percentage ??
        null
    );
}

/**
 * The trend: one value per wave, drawn as a line.
 *
 * What that value is depends on the question, and only some questions have one:
 *
 * - A **choice** question trends each option's share, one line per option.
 * - A **scale** trends its mean, an **NPS** question its score — one line, so
 *   §7's single-series rule applies and the chart carries no legend.
 * - A **matrix** has none. It is several distributions at once and the
 *   aggregator defines no single number for it; inventing one — "mean column
 *   index" — would be a metric nobody asked for on an axis nobody can read.
 *   `chartKindsFor` therefore does not offer a matrix the line encoding.
 * - **Text** questions chart nothing at all.
 */
export type TrendSeries = {
    readonly key: string;
    /** The author's option label. Empty for a single-series trend. */
    readonly label: string;
    readonly fill: string;
    /** One point per compared wave, oldest first; null where not asked. */
    readonly points: readonly (number | null)[];
};

export type WaveTrend = {
    /** How the axis and the tooltip read the numbers. */
    readonly unit: "percent" | "value";
    readonly series: readonly TrendSeries[];
};

export function toWaveTrend(question: ComparedQuestion): WaveTrend | null {
    const reference = question.question;

    switch (reference.type) {
        case "single_choice":
        case "multi_choice":
        case "dropdown": {
            const rows = toWaveCategoryRows(question);
            // Guarded here as well as in `chartKindsFor`: a line per option
            // past the palette's five would need a sixth colour, and §7 has
            // none. The bars remain, which is the right encoding at that size.
            if (rows.length > SERIES_FILLS.length) return null;
            return {
                unit: "percent",
                series: rows.map((row, index) => ({
                    key: row.key,
                    label: row.label,
                    fill: seriesFill(index),
                    points: row.values
                }))
            };
        }

        case "opinion_scale":
        case "nps":
            return {
                unit: "value",
                series: [
                    {
                        key: reference.key,
                        // §7's single-series comparison: one line, `--chart-1`,
                        // no legend — so the series needs no label of its own.
                        label: "",
                        fill: SERIES_FILLS[0],
                        points: question.cells.map(scalarOf)
                    }
                ]
            };

        case "matrix_single":
        case "short_text":
        case "long_text":
            return null;

        default:
            return assertNever(reference, "question type");
    }
}

/** The one number an ordered question is worth per wave. */
function scalarOf(cell: WaveCell): number | null {
    if (cell.state !== "compared") return null;
    return scalarOfSummary(cell.summary);
}

function scalarOfSummary(summary: QuestionSummary): number | null {
    switch (summary.kind) {
        case "numeric":
            return summary.mean;
        case "nps":
            return summary.score;
        // Reached only if a question type's summary shape changes under it;
        // `toWaveTrend` asks for a scalar of nothing else.
        case "categorical":
        case "text":
        case "matrix":
            return null;
        default:
            return assertNever(summary, "summary kind");
    }
}
