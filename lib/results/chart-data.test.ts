import { describe, expect, it } from "vitest";

import { aggregate } from "@/domain/aggregate";
import type { CategoricalSummary, MatrixSummary } from "@/domain/aggregate";
import {
    MAX_CATEGORICAL_COLORS,
    MAX_CATEGORY_BARS,
    TOP_CATEGORY_BARS,
    barWidth,
    toCategoryBars,
    toMatrixSeries,
    toRampBars
} from "@/lib/results/chart-data";
import { RAMP_STEPS } from "@/lib/results/ramp";
import {
    answersFor,
    dropdown,
    matrixSingle,
    nps,
    opinionScale,
    singleChoice
} from "@/domain/test-fixtures";

function categorical(question: typeof singleChoice | typeof dropdown) {
    const summary = aggregate(question, answersFor(question));
    if (summary.kind !== "categorical") throw new Error("expected categorical");
    return summary;
}

/** A categorical summary with `count` options, all with distinct counts. */
function wideSummary(count: number): CategoricalSummary {
    const base = categorical(dropdown);
    return {
        ...base,
        other: null,
        options: Array.from({ length: count }, (_, index) => ({
            value: `o${index}`,
            label: `Option ${index}`,
            count: count - index,
            percentage: count - index
        }))
    };
}

describe("toCategoryBars", () => {
    it("colours five or fewer with the palette, in order, no skipping", () => {
        const bars = toCategoryBars(wideSummary(5));
        expect(bars.map(b => b.fill)).toEqual([
            "var(--chart-1)",
            "var(--chart-2)",
            "var(--chart-3)",
            "var(--chart-4)",
            "var(--chart-5)"
        ]);
    });

    it("keeps document order at five or fewer", () => {
        // "Never / Sometimes / Always" is a sequence the author wrote; sorting
        // it by count destroys information the palette is not carrying.
        const summary: CategoricalSummary = {
            ...wideSummary(3),
            options: [
                { value: "never", label: "Never", count: 1, percentage: 10 },
                { value: "some", label: "Sometimes", count: 9, percentage: 90 },
                { value: "always", label: "Always", count: 5, percentage: 50 }
            ]
        };
        expect(toCategoryBars(summary).map(b => b.label)).toEqual([
            "Never",
            "Sometimes",
            "Always"
        ]);
    });

    it("never reaches for a sixth colour", () => {
        for (const count of [6, 7, 8, 9, 20]) {
            const fills = new Set(
                toCategoryBars(wideSummary(count)).map(b => b.fill)
            );
            expect(fills.has("var(--chart-6)")).toBe(false);
            expect(fills.has("var(--chart-7)")).toBe(false);
            expect(fills.has("var(--chart-8)")).toBe(false);
        }
    });

    it("switches to one fill sorted descending at six or more", () => {
        const bars = toCategoryBars(wideSummary(6));
        expect(new Set(bars.map(b => b.fill))).toEqual(
            new Set(["var(--chart-1)"])
        );
        const counts = bars.map(b => b.count);
        expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    });

    it("draws every bar up to the cap", () => {
        expect(toCategoryBars(wideSummary(MAX_CATEGORY_BARS))).toHaveLength(
            MAX_CATEGORY_BARS
        );
    });

    describe("past the cap", () => {
        it("keeps the top seven and aggregates the rest", () => {
            const bars = toCategoryBars(wideSummary(14));
            expect(bars).toHaveLength(TOP_CATEGORY_BARS + 1);
            expect(bars.filter(b => b.kind === "option")).toHaveLength(
                TOP_CATEGORY_BARS
            );
        });

        it("sorts the aggregate last however big it is", () => {
            const summary: CategoricalSummary = {
                ...wideSummary(9),
                options: [
                    { value: "a", label: "A", count: 1, percentage: 1 },
                    ...Array.from({ length: 8 }, (_, i) => ({
                        value: `b${i}`,
                        label: `B${i}`,
                        count: 100,
                        percentage: 10
                    }))
                ]
            };
            const bars = toCategoryBars(summary);
            const last = bars.at(-1);
            expect(last?.kind).toBe("overflow");
        });

        it("gives the aggregate the muted fill and the tail's labels", () => {
            const bars = toCategoryBars(wideSummary(10));
            const overflow = bars.at(-1);
            expect(overflow?.kind).toBe("overflow");
            expect(overflow?.fill).toBe("var(--muted)");
            expect(overflow?.contains).toEqual([
                "Option 7",
                "Option 8",
                "Option 9"
            ]);
        });

        it("sums the tail's counts into the aggregate", () => {
            const bars = toCategoryBars(wideSummary(10));
            // wideSummary(10) counts run 10 down to 1; the tail is 3, 2, 1.
            expect(bars.at(-1)?.count).toBe(6);
        });

        it("leaves the aggregate's label to the caller", () => {
            // It is owner-facing copy and belongs in the message catalogue.
            expect(toCategoryBars(wideSummary(10)).at(-1)?.label).toBe("");
        });
    });

    it("includes the free-text bucket as a real bar", () => {
        const summary = categorical(singleChoice);
        expect(summary.other).not.toBeNull();
        const bars = toCategoryBars(summary);
        expect(bars.filter(b => b.kind === "other")).toHaveLength(1);
    });

    it("does not mutate the summary it was given", () => {
        const summary = wideSummary(12);
        const before = summary.options.map(o => o.value);
        toCategoryBars(summary);
        expect(summary.options.map(o => o.value)).toEqual(before);
    });

    it("never produces more than five distinct colours", () => {
        for (let count = 2; count <= 30; count += 1) {
            const fills = new Set(
                toCategoryBars(wideSummary(count))
                    .filter(b => b.kind !== "overflow")
                    .map(b => b.fill)
            );
            expect(fills.size).toBeLessThanOrEqual(MAX_CATEGORICAL_COLORS);
        }
    });
});

describe("toRampBars", () => {
    it("keeps one bar per step, including the empty ones", () => {
        const summary = aggregate(opinionScale, answersFor(opinionScale));
        if (summary.kind !== "numeric") throw new Error("expected numeric");
        expect(toRampBars(summary)).toHaveLength(opinionScale.max);
    });

    it("bins eleven NPS scores across the seven ramp steps, monotonically", () => {
        const summary = aggregate(nps, answersFor(nps));
        if (summary.kind !== "nps") throw new Error("expected nps");

        const bars = toRampBars(summary);
        expect(bars).toHaveLength(11);

        let previous = 0;
        for (const bar of bars) {
            expect(bar.step).toBeGreaterThanOrEqual(previous);
            expect(bar.step).toBeLessThanOrEqual(RAMP_STEPS);
            previous = bar.step;
        }
        expect(bars.at(-1)?.step).toBe(RAMP_STEPS);
    });
});

describe("toMatrixSeries", () => {
    it("runs the ramp across the columns, not the rows", () => {
        const summary = aggregate(matrixSingle, answersFor(matrixSingle));
        if (summary.kind !== "matrix") throw new Error("expected matrix");

        const series = toMatrixSeries(summary);
        expect(series).toHaveLength(matrixSingle.rows.length);

        // Every row uses the same steps: the ordered axis is the column one.
        const steps = series.map(row => row.segments.map(s => s.step));
        for (const row of steps) expect(row).toEqual(steps[0]);
        expect(steps[0]).toHaveLength(matrixSingle.columns.length);
    });

    it("carries each row's answered count for its denominator", () => {
        const summary = aggregate(
            matrixSingle,
            answersFor(matrixSingle)
        ) as MatrixSummary;
        const series = toMatrixSeries(summary);
        for (const [index, row] of series.entries()) {
            expect(row.answeredCount).toBe(summary.rows[index]?.answeredCount);
        }
    });
});

describe("barWidth", () => {
    it("uses a dot decimal whatever the ambient locale", () => {
        // DESIGN §7: `width: '39,6%'` is invalid CSS and is dropped silently.
        expect(barWidth(39.64)).toBe("39.6%");
        expect(barWidth(39.64)).not.toContain(",");
    });

    it("clamps outside 0-100", () => {
        expect(barWidth(-5)).toBe("0.0%");
        expect(barWidth(180)).toBe("100.0%");
    });

    it("always yields a valid CSS percentage", () => {
        for (const value of [0, 0.04, 12.35, 99.99, 100]) {
            expect(barWidth(value)).toMatch(/^\d+\.\d%$/);
        }
    });
});
