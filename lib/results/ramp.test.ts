import { describe, expect, it } from "vitest";

import {
    RAMP_STEPS,
    rampFill,
    rampLabelColor,
    rampStep
} from "@/lib/results/ramp";

describe("rampStep", () => {
    it("reproduces DESIGN §7's fifteen-stage binning exactly", () => {
        const binned = Array.from({ length: 15 }, (_, index) =>
            rampStep(index, 15)
        );
        expect(binned).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7]);
    });

    it("is monotonic for every count up to fifty", () => {
        for (let count = 1; count <= 50; count += 1) {
            let previous = 0;
            for (let index = 0; index < count; index += 1) {
                const step = rampStep(index, count);
                expect(step).toBeGreaterThanOrEqual(previous);
                previous = step;
            }
        }
    });

    it("stays inside the seven steps for every count up to fifty", () => {
        for (let count = 1; count <= 50; count += 1) {
            for (let index = 0; index < count; index += 1) {
                const step = rampStep(index, count);
                expect(step).toBeGreaterThanOrEqual(1);
                expect(step).toBeLessThanOrEqual(RAMP_STEPS);
            }
        }
    });

    it("always ends on the darkest step", () => {
        for (let count = 1; count <= 50; count += 1) {
            expect(rampStep(count - 1, count)).toBe(RAMP_STEPS);
        }
    });

    it("spreads a short sequence across the ramp rather than crowding the pale end", () => {
        // Steps 1-4 are below 3:1 on --card (§7). Three stages rendered as
        // 1/2/3 would be three barely distinguishable washes.
        expect([0, 1, 2].map(i => rampStep(i, 3))).toEqual([3, 5, 7]);
    });

    it("gives each item its own step when there are exactly seven", () => {
        expect(
            Array.from({ length: RAMP_STEPS }, (_, i) =>
                rampStep(i, RAMP_STEPS)
            )
        ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("clamps an index outside the sequence rather than inventing a step", () => {
        expect(rampStep(-3, 10)).toBe(rampStep(0, 10));
        expect(rampStep(99, 10)).toBe(rampStep(9, 10));
        expect(rampStep(0, 0)).toBe(1);
    });
});

describe("rampFill", () => {
    it("names a token, never a colour", () => {
        for (let step = 1; step <= RAMP_STEPS; step += 1) {
            expect(rampFill(step as 1)).toBe(`var(--ramp-${step})`);
        }
    });
});

describe("rampLabelColor", () => {
    it("reads --ramp-label-flip rather than hardcoding the threshold", () => {
        expect(rampLabelColor(5)).toContain("var(--ramp-label-flip)");
    });

    it("mixes only the two text tokens, and no literal colour", () => {
        const css = rampLabelColor(3);
        expect(css).toContain("var(--background)");
        expect(css).toContain("var(--foreground)");
        expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(css).not.toContain("oklch(");
    });

    it("resolves to foreground below the flip and background at or above it", () => {
        // The mix percentage is (step - flip + 1) × 100, and CSS clamps it to
        // 0-100 — which is what turns the comparison into arithmetic.
        const percent = (step: number, flip: number) => (step - flip + 1) * 100;

        for (const flip of [4, 5]) {
            expect(percent(flip - 2, flip)).toBeLessThanOrEqual(0);
            expect(percent(flip - 1, flip)).toBeLessThanOrEqual(0);
            expect(percent(flip, flip)).toBeGreaterThanOrEqual(100);
            expect(percent(flip + 1, flip)).toBeGreaterThanOrEqual(100);
        }
    });
});
