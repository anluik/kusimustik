import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CategoryChart } from "@/components/results/category-chart";
import { renderWithIntl } from "@/components/test-support";
import type { CategoryBar } from "@/lib/results/chart-data";

/**
 * The regression test for the defect the whole test suite was shaped not to
 * see: `lib/results/chart-data.ts` produced correct numbers and every one of
 * its tests passed while the charts on screen rendered nothing at all.
 *
 * jsdom performs no layout, so every element measures 0×0 — which is exactly
 * the state a real browser was intermittently caught in (docs/DECISIONS.md
 * 020). A chart that draws its bars here is a chart that cannot be zeroed out
 * by a container it happened to measure before layout.
 *
 * `ResizeObserver` is stubbed because jsdom has none, and its *absence* is
 * what let the old code pass this test: Recharts bailed out of measuring
 * altogether and kept its initial dimensions. A browser has one, observes a
 * box of no size, and draws nothing — so the stub is the honest environment.
 * It deliberately never calls back: the point of the defect was that no second
 * measurement ever arrived.
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

function bars(count: number): readonly CategoryBar[] {
    return Array.from({ length: count }, (_, index) => ({
        key: `option_${index + 1}`,
        label: `Valik ${index + 1}`,
        count: index + 1,
        percentage: 10 * (index + 1),
        fill: `var(--chart-${index + 1})`,
        kind: "option" as const,
        contains: []
    }));
}

describe.each(["horizontal", "vertical"] as const)(
    "CategoryChart (%s)",
    orientation => {
        it("draws a bar per category in a container of no measured size", () => {
            const { container } = renderWithIntl(
                <CategoryChart bars={bars(4)} orientation={orientation} />
            );

            expect(container.querySelector("svg")).not.toBeNull();
            expect(
                container.querySelectorAll(".recharts-rectangle")
            ).toHaveLength(4);
        });

        it("keeps each bar's assigned fill", () => {
            const { container } = renderWithIntl(
                <CategoryChart bars={bars(3)} orientation={orientation} />
            );

            const fills = [
                ...container.querySelectorAll(".recharts-rectangle")
            ].map(bar => bar.getAttribute("fill"));
            expect(fills).toEqual([
                "var(--chart-1)",
                "var(--chart-2)",
                "var(--chart-3)"
            ]);
        });
    }
);
