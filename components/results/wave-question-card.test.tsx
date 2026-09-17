import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/test-support";
import { WaveQuestionCard } from "@/components/results/wave-question-card";
import type { ComparisonRow } from "@/domain/comparison";
import { newComparisonRowId } from "@/domain/ids";
import { buildComparison } from "@/lib/results/wave-comparison";
import type { WaveComparison } from "@/lib/results/wave-comparison";
import { choice, compareByKey, scale, wave } from "@/lib/results/wave-fixtures";

/**
 * What the card must never do: render a wave the row holds nothing from as an
 * empty series and leave the owner to notice. A missing wave is a sentence on
 * the card (PLAN Phase 11), for the same reason `unshownCount` is one — and so
 * is a row the owner has not yet confirmed (docs/DECISIONS.md 035).
 *
 * `ResizeObserver` is stubbed for the same reason `category-chart.test.tsx`
 * stubs it — jsdom has none, and without it Recharts never measures and never
 * draws (docs/DECISIONS.md 020).
 */

class SilentResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(() => {
    vi.stubGlobal("ResizeObserver", SilentResizeObserver);
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function card(comparison: WaveComparison) {
    const [row] = comparison.rows;
    if (row === undefined) throw new Error("no compared row");
    return <WaveQuestionCard row={row} waves={comparison.waves} position={1} />;
}

describe("WaveQuestionCard", () => {
    it("names the wave the row holds nothing from", () => {
        const asked = choice("2026", "role", ["a", "b"]);
        const waves = [
            wave("2025", []),
            wave(
                "2026",
                [asked],
                [{ [asked.id]: { type: "single_choice", value: "a" } }]
            )
        ];

        const { getByText, container } = renderWithIntl(
            card(compareByKey(waves))
        );

        expect(getByText("Vastet pole: 2025")).toBeDefined();
        // And the chart is still drawn, from the wave that did ask.
        expect(container.querySelector("svg")).not.toBeNull();
    });

    it("says when a matched question stopped fitting its row", () => {
        const waves = [
            wave("2025", [scale("2025", "role")]),
            wave("2026", [choice("2026", "role", ["a", "b"])])
        ];
        const row: ComparisonRow = {
            id: newComparisonRowId(),
            matches: waves.map(each => ({
                surveyId: each.survey.id,
                questionId: each.survey.elements[0]?.id ?? missing()
            }))
        };

        const { getByText } = renderWithIntl(
            card(buildComparison({ waves, rows: [row], removed: new Map() }))
        );

        expect(
            getByText(/Ei ole enam võrreldav, küsimus on muutunud: /)
        ).toBeDefined();
    });

    it("labels each wave's own ramp when the waves are drawn one by one", () => {
        // DESIGN §7 gives ordered data the ramp, so the wave cannot be a
        // colour and becomes a caption instead — one block per wave.
        const older = scale("2025", "satisfaction");
        const newer = scale("2026", "satisfaction");
        const waves = [
            wave(
                "2025",
                [older],
                [{ [older.id]: { type: "opinion_scale", value: 3 } }]
            ),
            wave(
                "2026",
                [newer],
                [{ [newer.id]: { type: "opinion_scale", value: 5 } }]
            )
        ];

        const { getByText, getAllByText } = renderWithIntl(
            card(compareByKey(waves))
        );

        expect(getByText("2025")).toBeDefined();
        expect(getByText("2026")).toBeDefined();
        expect(getAllByText("1 vastus")).toHaveLength(2);
    });

    it("says so rather than charting nothing when no wave has answers", () => {
        const waves = [
            wave("2025", [choice("2025", "role", ["a", "b"])]),
            wave("2026", [choice("2026", "role", ["a", "b"])])
        ];

        const { getByText, container } = renderWithIntl(
            card(compareByKey(waves))
        );

        expect(
            getByText(
                "Ükski laine ei ole sellele küsimusele veel vastuseid saanud."
            )
        ).toBeDefined();
        expect(container.querySelector("svg")).toBeNull();
    });
});

function missing(): never {
    throw new Error("fixture missing");
}
