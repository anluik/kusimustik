import { assertNever } from "@/domain/assert-never";
import type { AnswerableQuestion } from "@/domain/question";

/**
 * Which encodings a question may be charted with.
 *
 * This is the switcher's menu, derived from the question rather than fixed, so
 * that adding a question type is a decision about how it is *drawn* and not
 * just how it is answered. See docs/DECISIONS.md 017.
 *
 * The rules are `docs/DESIGN.md` §7's, not a preference:
 *
 * - Categorical data gets bars. Horizontal whenever the labels are words,
 *   which is nearly always, so horizontal is the default and vertical is the
 *   conditional one — §7 forbids rotated labels outright, so a vertical chart
 *   is only offered where it can label itself.
 * - Ordered data — scales, NPS, matrix intensity — is *always* the ramp, never
 *   the categorical palette.
 * - There are no pie or doughnut charts, at any count.
 * - A line encodes a value across a series, and is offered only where the
 *   series can be drawn in five colours or fewer — see `hasSeriesLine`.
 */

export const CHART_KINDS = [
    /** Bars across, one per category, sorted descending and directly labelled. */
    "bar_horizontal",
    /** Bars up. Only where the category labels fit without rotating. */
    "bar_vertical",
    /** One ramp-filled bar per step of an ordered scale. */
    "ramp_bar",
    /** A single bar split into ramp-filled segments; one per matrix row. */
    "ramp_stacked",
    /** A value tracked across waves or over time. Series data only. */
    "line"
] as const;

export type ChartKind = (typeof CHART_KINDS)[number];

/**
 * Whether the summaries being charted are one wave's, or the same question
 * across several. The results screen passes `"single_wave"`; the wave
 * comparison (PLAN Phase 11) is what passes `"series"`.
 */
export const CHART_DATA_SHAPES = ["single_wave", "series"] as const;

export type ChartDataShape = (typeof CHART_DATA_SHAPES)[number];

/**
 * Vertical bars are withheld past this many categories: DESIGN §7 caps the
 * categorical palette at five, and beyond it the encoding has to change rather
 * than the palette grow.
 */
export const CHART_VERTICAL_MAX_OPTIONS = 5;

/**
 * And withheld past this label length, in characters. A vertical bar chart
 * labels its categories under the axis, and §7 does not allow the rotation
 * that a long label would otherwise need. Deliberately generous-to-strict: a
 * label that only just fits at one viewport width does not fit at another.
 */
export const CHART_SHORT_LABEL_MAX = 12;

/**
 * How many lines a series chart may draw, which is §7's five-colour cap again:
 * a comparison plots one line per option, and there is no sixth hue to give a
 * sixth option. Past it the bars remain, which is the encoding change §7 asks
 * for rather than a palette that grows.
 */
export const CHART_MAX_LINES = 5;

/**
 * The kinds this question may be drawn with, **default first**, or an empty
 * list for a question there is nothing to chart about.
 *
 * The switch is exhaustive and ends in `assertNever`: a tenth question type
 * fails to compile here until someone decides how it is drawn.
 */
export function chartKindsFor(
    question: AnswerableQuestion,
    shape: ChartDataShape
): readonly ChartKind[] {
    const base = baseKinds(question);

    // Nothing to chart stays nothing to chart — a wall of free text is no more
    // chartable for having been collected twice.
    if (base.length === 0) return base;

    // A line is an option on a series, never the default: the owner switching
    // to the comparison view should not also have their encoding changed under
    // them. And only where there is something to plot — see `hasSeriesLine`.
    return shape === "series" && hasSeriesLine(question)
        ? [...base, "line"]
        : base;
}

/**
 * Whether this question's waves can be drawn as lines.
 *
 * A line needs one number per wave per series, and what that number is depends
 * on the question:
 *
 * - **Choice** questions trend each option's share, one line per option — so
 *   they qualify up to `CHART_MAX_LINES` options, the free-text bucket counted.
 * - **`opinion_scale`** trends its mean and **`nps`** its score: a single line,
 *   which §7 draws in `--chart-1` with no legend at all.
 * - **`matrix_single`** has no such number. It is several distributions at
 *   once, and the aggregator defines no scalar for it; picking one would invent
 *   a metric rather than report one. Its waves are compared as ramps instead.
 * - **Text** questions chart nothing in any shape.
 */
export function hasSeriesLine(question: AnswerableQuestion): boolean {
    switch (question.type) {
        case "single_choice":
        case "multi_choice":
            return (
                question.options.length + (question.allowOther ? 1 : 0) <=
                CHART_MAX_LINES
            );

        case "dropdown":
            return question.options.length <= CHART_MAX_LINES;

        case "opinion_scale":
        case "nps":
            return true;

        case "matrix_single":
        case "short_text":
        case "long_text":
            return false;

        default:
            return assertNever(question, "question type");
    }
}

/** The kind to render before the owner has chosen one; null if unchartable. */
export function defaultChartKind(
    question: AnswerableQuestion,
    shape: ChartDataShape
): ChartKind | null {
    return chartKindsFor(question, shape)[0] ?? null;
}

/**
 * Whether one kind is available. The owner's choice is persisted per question
 * key, so an edit that adds a sixth option has to be able to invalidate a
 * stored `bar_vertical` rather than render something DESIGN §7 forbids.
 */
export function supportsChartKind(
    question: AnswerableQuestion,
    shape: ChartDataShape,
    kind: ChartKind
): boolean {
    return chartKindsFor(question, shape).includes(kind);
}

function baseKinds(question: AnswerableQuestion): readonly ChartKind[] {
    switch (question.type) {
        case "single_choice":
        case "multi_choice":
            return categoricalKinds(
                question.options.map(option => option.label),
                question.allowOther ? (question.otherLabel ?? "") : null
            );

        case "dropdown":
            // No free-text option: `dropdown` exists for long option lists and
            // does not offer one.
            return categoricalKinds(
                question.options.map(option => option.label),
                null
            );

        case "short_text":
        case "long_text":
            // A `TextSummary` is a list of responses. Charting the *lengths* of
            // what people wrote would be a chart of nothing.
            return [];

        case "opinion_scale":
        case "nps":
        case "matrix_single":
            return ["ramp_bar", "ramp_stacked"];

        default:
            return assertNever(question, "question type");
    }
}

function categoricalKinds(
    labels: readonly string[],
    otherLabel: string | null
): readonly ChartKind[] {
    // The free-text bucket is a bar like any other, so it counts against both
    // thresholds.
    const all = otherLabel === null ? labels : [...labels, otherLabel];

    const fitsVertically =
        all.length <= CHART_VERTICAL_MAX_OPTIONS &&
        all.every(label => label.length <= CHART_SHORT_LABEL_MAX);

    return fitsVertically
        ? ["bar_horizontal", "bar_vertical"]
        : ["bar_horizontal"];
}
