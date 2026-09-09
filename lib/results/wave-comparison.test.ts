import { describe, expect, it } from "vitest";

import {
    MAX_COMPARED_WAVES,
    buildWaveComparison
} from "@/lib/results/wave-comparison";
import type { WaveComparison } from "@/lib/results/wave-comparison";
import { choice, scale, statement, wave } from "@/lib/results/wave-fixtures";

/**
 * The join, without a database. `lib/db/waves.db.test.ts` proves the same thing
 * against the seed; this covers the shapes a seed cannot hold — a wave group
 * longer than the palette, a question that came back after a wave without it,
 * and a key that changed hands between element types.
 */

function keys(comparison: WaveComparison): readonly string[] {
    return comparison.questions.map(question => question.key);
}

function states(comparison: WaveComparison, key: string): readonly string[] {
    const found = comparison.questions.find(question => question.key === key);
    if (found === undefined) throw new Error(`no compared question ${key}`);
    return found.cells.map(cell => cell.state);
}

describe("buildWaveComparison", () => {
    it("keeps the waves in the order they arrive, oldest first", () => {
        const comparison = buildWaveComparison([
            wave("2025", [choice("2025", "role")]),
            wave("2026", [choice("2026", "role")])
        ]);

        expect(comparison.waves.map(w => w.waveLabel)).toEqual([
            "2025",
            "2026"
        ]);
        expect(comparison.omittedWaveCount).toBe(0);
    });

    it("orders questions by the newest wave, then by what only older ones ask", () => {
        const comparison = buildWaveComparison([
            wave("2025", [
                choice("2025", "role"),
                choice("2025", "dropped"),
                scale("2025", "satisfaction")
            ]),
            wave("2026", [
                scale("2026", "satisfaction"),
                choice("2026", "role"),
                choice("2026", "added")
            ])
        ]);

        expect(keys(comparison)).toEqual([
            "satisfaction",
            "role",
            "added",
            "dropped"
        ]);
    });

    it("summarises each wave against its own definition and answers", () => {
        const older = choice("2025", "role");
        const newer = choice("2026", "role");

        const comparison = buildWaveComparison([
            wave(
                "2025",
                [older],
                [
                    { [older.id]: { type: "single_choice", value: "a" } },
                    { [older.id]: { type: "single_choice", value: "b" } }
                ]
            ),
            wave(
                "2026",
                [newer],
                [{ [newer.id]: { type: "single_choice", value: "a" } }]
            )
        ]);

        const [role] = comparison.questions;
        // The card is titled with the newest wording, and the ids differ —
        // the only thing the two waves share is the key.
        expect(role?.question.id).toBe(newer.id);
        expect(role?.question.title).toBe("role in 2026");
        expect(older.id).not.toBe(newer.id);

        const [first, second] = role?.cells ?? [];
        if (first?.state !== "compared" || second?.state !== "compared") {
            throw new Error("both waves should have been compared");
        }
        expect(first.summary.questionId).toBe(older.id);
        expect(first.summary.answeredCount).toBe(2);
        expect(second.summary.questionId).toBe(newer.id);
        expect(second.summary.answeredCount).toBe(1);
    });

    it("says a wave did not ask a question rather than showing it as nought", () => {
        const comparison = buildWaveComparison([
            wave("2025", [choice("2025", "role")]),
            wave("2026", []),
            wave("2027", [choice("2027", "role")])
        ]);

        // Absent in the middle wave, and still compared either side of it: a
        // question that came back is one series with a gap, not two questions.
        expect(states(comparison, "role")).toEqual([
            "compared",
            "absent",
            "compared"
        ]);
        const [role] = comparison.questions;
        expect(role?.comparedCount).toBe(2);
        expect(role?.missingCount).toBe(1);
    });

    it("refuses to compare a key that changed type, or became a statement", () => {
        const comparison = buildWaveComparison([
            wave("2025", [scale("2025", "role"), statement("2025", "intro")]),
            wave("2026", [choice("2026", "role"), choice("2026", "intro")])
        ]);

        expect(states(comparison, "role")).toEqual(["mismatched", "compared"]);
        expect(states(comparison, "intro")).toEqual(["mismatched", "compared"]);

        const role = comparison.questions.find(q => q.key === "role");
        expect(
            role?.cells[0]?.state === "mismatched" && role.cells[0].type
        ).toBe("opinion_scale");
    });

    it("never gives a statement a card of its own", () => {
        const comparison = buildWaveComparison([
            wave("2026", [statement("2026", "intro"), choice("2026", "role")])
        ]);
        expect(keys(comparison)).toEqual(["role"]);
    });

    it("compares the most recent waves and reports the ones it left out", () => {
        const waves = Array.from({ length: MAX_COMPARED_WAVES + 2 }, (_, i) => {
            const label = `20${20 + i}`;
            return wave(label, [choice(label, "role")]);
        });

        const comparison = buildWaveComparison(waves);

        expect(comparison.waves).toHaveLength(MAX_COMPARED_WAVES);
        expect(comparison.omittedWaveCount).toBe(2);
        // The five kept are the *newest* five, and they stay in order.
        expect(comparison.waves.map(w => w.waveLabel)).toEqual([
            "2022",
            "2023",
            "2024",
            "2025",
            "2026"
        ]);
    });

    it("holds a wave with no responses as a wave with none, not a missing one", () => {
        const question = choice("2026", "role");
        const comparison = buildWaveComparison([
            wave("2025", [choice("2025", "role")]),
            wave("2026", [question])
        ]);

        const [, second] = comparison.questions[0]?.cells ?? [];
        expect(second?.state).toBe("compared");
        expect(
            second?.state === "compared" && second.summary.responseCount
        ).toBe(0);
        expect(comparison.waves[1]?.responseCount).toBe(0);
    });
});
