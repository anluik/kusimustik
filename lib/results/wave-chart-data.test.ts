import { describe, expect, it } from "vitest";

import {
    OTHER_ROW,
    SERIES_FILLS,
    toWaveCategoryRows,
    toWaveTrend
} from "@/lib/results/wave-chart-data";
import { buildWaveComparison } from "@/lib/results/wave-comparison";
import type { ComparedQuestion } from "@/lib/results/wave-comparison";
import { choice, scale, wave } from "@/lib/results/wave-fixtures";
import type { WaveResponses } from "@/lib/db/waves";

/**
 * The shapes the comparison charts read. The rule under all of them: a wave
 * that did not ask contributes `null`, and a wave that asked and got no takers
 * contributes nought — the two must never be drawn the same way.
 */

function only(waves: readonly WaveResponses[]): ComparedQuestion {
    const [question] = buildWaveComparison(waves).questions;
    if (question === undefined) throw new Error("no compared question");
    return question;
}

describe("toWaveCategoryRows", () => {
    it("gives every wave a share of its own answers, not a count", () => {
        const older = choice("2025", "role", ["a", "b"]);
        const newer = choice("2026", "role", ["a", "b"]);

        const rows = toWaveCategoryRows(
            only([
                // Four respondents, three of them "a": 75%.
                wave(
                    "2025",
                    [older],
                    ["a", "a", "a", "b"].map(value => ({
                        [older.id]: { type: "single_choice" as const, value }
                    }))
                ),
                // One respondent, "a": 100%. Twice the share on a quarter of
                // the answers, which is the whole reason this is not a count.
                wave(
                    "2026",
                    [newer],
                    [{ [newer.id]: { type: "single_choice", value: "a" } }]
                )
            ])
        );

        expect(rows.map(row => row.key)).toEqual(["a", "b"]);
        expect(rows[0]?.values).toEqual([75, 100]);
        expect(rows[1]?.values).toEqual([25, 0]);
    });

    it("matches options on their stored value, however they were relabelled", () => {
        const older = choice("2025", "role", ["a", "b"]);
        const newer = choice("2026", "role", ["a", "b"]);
        expect(older.options[0]?.label).not.toBe(newer.options[0]?.label);

        const rows = toWaveCategoryRows(
            only([wave("2025", [older]), wave("2026", [newer])])
        );

        // One row per option, named as the newest wave names it.
        expect(rows).toHaveLength(2);
        expect(rows[0]?.label).toBe(newer.options[0]?.label);
    });

    it("distinguishes an option a wave never offered from one nobody chose", () => {
        const older = choice("2025", "role", ["a", "x"]);
        const newer = choice("2026", "role", ["a", "b"]);

        const rows = toWaveCategoryRows(
            only([
                wave(
                    "2025",
                    [older],
                    [{ [older.id]: { type: "single_choice", value: "a" } }]
                ),
                wave(
                    "2026",
                    [newer],
                    [{ [newer.id]: { type: "single_choice", value: "a" } }]
                )
            ])
        );

        // `b` did not exist in 2025 — null, no bar — and existed but went
        // unchosen in 2026, which is nought and is a finding.
        expect(rows[1]?.key).toBe("b");
        expect(rows[1]?.values).toEqual([null, 0]);
    });

    it("keeps an option only an older wave offered, after the current ones", () => {
        const older = choice("2025", "role", ["a", "gone"]);
        const newer = choice("2026", "role", ["a", "b"]);

        const rows = toWaveCategoryRows(
            only([wave("2025", [older]), wave("2026", [newer])])
        );

        expect(rows.map(row => row.key)).toEqual(["a", "b", "gone"]);
        expect(rows[2]?.values).toEqual([0, null]);
    });

    it("gives the free-text bucket a row of its own", () => {
        const withOther = {
            ...choice("2026", "role", ["a", "b"]),
            allowOther: true as const,
            otherLabel: "Muu"
        };

        const rows = toWaveCategoryRows(
            only([
                wave(
                    "2026",
                    [withOther],
                    [
                        {
                            [withOther.id]: {
                                type: "single_choice",
                                value: "__other__",
                                other: "Something else"
                            }
                        }
                    ]
                )
            ])
        );

        expect(rows.map(row => row.key)).toEqual(["a", "b", OTHER_ROW]);
        expect(rows[2]?.values).toEqual([100]);
    });

    it("leaves a wave that did not ask the question out of every row", () => {
        const question = choice("2026", "role", ["a", "b"]);
        const rows = toWaveCategoryRows(
            only([wave("2025", []), wave("2026", [question])])
        );

        for (const row of rows) expect(row.values[0]).toBeNull();
    });
});

describe("toWaveTrend", () => {
    it("plots one line per option, in the palette's order", () => {
        const question = choice("2026", "role", ["a", "b"]);
        const trend = toWaveTrend(
            only([
                wave("2025", [choice("2025", "role", ["a", "b"])]),
                wave("2026", [question])
            ])
        );

        expect(trend?.unit).toBe("percent");
        expect(trend?.series.map(series => series.fill)).toEqual([
            SERIES_FILLS[0],
            SERIES_FILLS[1]
        ]);
        expect(trend?.series.map(series => series.label)).toEqual(
            question.options.map(option => option.label)
        );
    });

    it("plots a scale as one unlabelled line of its mean", () => {
        const question = scale("2026", "satisfaction");
        const trend = toWaveTrend(
            only([
                wave("2025", [scale("2025", "satisfaction")]),
                wave(
                    "2026",
                    [question],
                    [
                        { [question.id]: { type: "opinion_scale", value: 4 } },
                        { [question.id]: { type: "opinion_scale", value: 5 } }
                    ]
                )
            ])
        );

        expect(trend?.unit).toBe("value");
        // DESIGN §7's single-series comparison: one line, and no legend to
        // label, so the series carries no label of its own.
        expect(trend?.series).toHaveLength(1);
        expect(trend?.series[0]?.label).toBe("");
        expect(trend?.series[0]?.fill).toBe(SERIES_FILLS[0]);
        // A wave with no answers has no mean, and a gap is not a nought.
        expect(trend?.series[0]?.points).toEqual([null, 4.5]);
    });

    it("has nothing to plot for a question with no single value per wave", () => {
        // More options than the palette has colours; the bars stay.
        const wide = choice("2026", "role", ["a", "b", "c", "d", "e", "f"]);
        expect(toWaveTrend(only([wave("2026", [wide])]))).toBeNull();
    });
});
