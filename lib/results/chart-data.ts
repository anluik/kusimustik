import type {
    CategoricalSummary,
    MatrixSummary,
    NpsSummary,
    NumericSummary
} from "@/domain/aggregate";
import { rampStep } from "@/lib/results/ramp";
import type { RampStep } from "@/lib/results/ramp";

/**
 * Turns a `QuestionSummary` into rows a chart can render, applying
 * `docs/DESIGN.md` §7's colour rules — which are not stylistic and are not the
 * component's to reinterpret:
 *
 * - Five or fewer categories get `--chart-1` … `--chart-5`, in order, no
 *   skipping, in document order.
 * - Six or more change the *encoding*, not the palette: one fill, sorted
 *   descending. There is never a sixth colour.
 * - More than eight collapse to the top seven plus an aggregate bar in
 *   `--muted`, which always sorts last however big it is.
 * - Ordered data uses the ramp and only the ramp.
 *
 * Kept pure and out of the components so the rules are testable and so a chart
 * cannot quietly grow its own palette.
 */

/** §7: the categorical palette is deuteranopia-separable only this far. */
export const MAX_CATEGORICAL_COLORS = 5;

/** Past this many bars, §7 aggregates the tail rather than drawing it. */
export const MAX_CATEGORY_BARS = 8;

/** How many real bars survive that aggregation. */
export const TOP_CATEGORY_BARS = 7;

export type CategoryBarKind =
    /** One of the question's own options. */
    | "option"
    /** The question's free-text "other" bucket, which is a real answer. */
    | "other"
    /** §7's aggregate of the tail. Not an answer anyone gave. */
    | "overflow";

export type CategoryBar = {
    readonly key: string;
    readonly label: string;
    readonly count: number;
    readonly percentage: number;
    /** A `var(--…)` reference. Never a literal; §7 and CLAUDE.md both forbid it. */
    readonly fill: string;
    readonly kind: CategoryBarKind;
    /** What an overflow bar stands for, so its tooltip can list it. */
    readonly contains: readonly string[];
};

export type RampBar = {
    readonly key: string;
    readonly label: string;
    readonly count: number;
    readonly percentage: number;
    readonly step: RampStep;
};

export type MatrixRowSeries = {
    readonly key: string;
    readonly label: string;
    readonly answeredCount: number;
    readonly segments: readonly RampBar[];
};

/**
 * Categorical bars, ordered and coloured per §7.
 *
 * Takes no chart kind, deliberately. Both bar orientations want the same bars
 * in the same order — the rule turns on how many categories there are, not on
 * which way they are drawn — and `chartKindsFor` has already guaranteed that
 * the vertical one is only ever offered at five or fewer.
 */
export function toCategoryBars(
    summary: CategoricalSummary
): readonly CategoryBar[] {
    const entries: CategoryBar[] = summary.options.map(option => ({
        key: option.value,
        label: option.label,
        count: option.count,
        percentage: option.percentage,
        fill: "",
        kind: "option" as const,
        contains: []
    }));

    if (summary.other !== null) {
        entries.push({
            key: "__other__",
            label: summary.other.label ?? "",
            count: summary.other.count,
            percentage: summary.other.percentage,
            fill: "",
            kind: "other",
            contains: []
        });
    }

    // Five or fewer: the palette carries the distinction, so keep the order the
    // author wrote — for a set like "Never / Sometimes / Always" that order is
    // information, and sorting it by count would destroy it.
    if (entries.length <= MAX_CATEGORICAL_COLORS) {
        return entries.map((entry, index) => ({
            ...entry,
            fill: `var(--chart-${index + 1})`
        }));
    }

    // Six or more: one fill, sorted descending, directly labelled. Sorted on a
    // copy — `summary.options` is the aggregator's array and callers share it.
    const sorted = [...entries].sort((a, b) => b.count - a.count);

    if (sorted.length <= MAX_CATEGORY_BARS) {
        return sorted.map(entry => ({ ...entry, fill: "var(--chart-1)" }));
    }

    const head = sorted.slice(0, TOP_CATEGORY_BARS);
    const tail = sorted.slice(TOP_CATEGORY_BARS);

    return [
        ...head.map(entry => ({ ...entry, fill: "var(--chart-1)" })),
        {
            key: "__overflow__",
            // The label is respondent-visible copy and belongs to the message
            // catalogue, so the component supplies it; this only says how many.
            label: "",
            count: sum(tail.map(entry => entry.count)),
            percentage: round(sum(tail.map(entry => entry.percentage)), 1),
            fill: "var(--muted)",
            kind: "overflow" as const,
            contains: tail.map(entry => entry.label)
        }
    ];
}

/**
 * An ordered distribution as ramp bars — one per step of the scale, including
 * the empty ones, so two waves of the same question line up bar for bar.
 */
export function toRampBars(
    summary: NumericSummary | NpsSummary
): readonly RampBar[] {
    const { distribution } = summary;
    return distribution.map((bucket, index) => ({
        key: String(bucket.value),
        label: String(bucket.value),
        count: bucket.count,
        percentage: bucket.percentage,
        step: rampStep(index, distribution.length)
    }));
}

/**
 * One series per matrix row, its segments in column order.
 *
 * The ramp runs across the *columns*, which is the ordered axis — "Poor,
 * Adequate, Good" is a sequence, and colouring the rows instead would encode
 * the arbitrary order the author happened to list them in.
 */
export function toMatrixSeries(
    summary: MatrixSummary
): readonly MatrixRowSeries[] {
    return summary.rows.map(row => ({
        key: row.value,
        label: row.label,
        answeredCount: row.answeredCount,
        segments: row.cells.map((cell, index) => ({
            key: cell.value,
            label: cell.label,
            count: cell.count,
            percentage: cell.percentage,
            step: rampStep(index, summary.columns.length)
        }))
    }));
}

/**
 * A CSS length for a bar, as a percentage.
 *
 * DESIGN §7: compute widths with a dot decimal. `Intl` formatting is for
 * display strings only — `width: '39,6%'` is invalid CSS, is dropped silently,
 * and the bug is invisible in review and obvious in production. Every width in
 * the results UI goes through here so there is one place to get it right.
 */
export function barWidth(percentage: number): string {
    const clamped = Math.min(Math.max(percentage, 0), 100);
    return `${clamped.toFixed(1)}%`;
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
