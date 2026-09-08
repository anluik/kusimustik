import { describe, expect, it } from "vitest";

import {
    MIN_SUBMIT_MS,
    SubmitGuardSchema,
    looksAutomated
} from "@/lib/runner/honeypot";

/**
 * The two filters in front of the submission (docs/PLAN.md Phase 9). What is
 * worth pinning down is the direction of each failure: an ordinary respondent
 * must pass, and every way of not being one must not.
 */

const human = { hp: "", elapsedMs: MIN_SUBMIT_MS * 10 };

describe("looksAutomated", () => {
    it("lets an ordinary submission through", () => {
        expect(looksAutomated(human)).toBe(false);
    });

    it("catches a filled honeypot however long it took", () => {
        expect(looksAutomated({ ...human, hp: "https://example.com" })).toBe(
            true
        );
    });

    it("counts whitespace in the honeypot as filled", () => {
        // A field a respondent never sees is empty; anything else was typed
        // into it by something that could not see it either.
        expect(looksAutomated({ ...human, hp: "   " })).toBe(true);
    });

    it("catches a submission that beat the floor", () => {
        expect(looksAutomated({ ...human, elapsedMs: MIN_SUBMIT_MS - 1 })).toBe(
            true
        );
    });

    it("admits one exactly on the floor", () => {
        expect(looksAutomated({ ...human, elapsedMs: MIN_SUBMIT_MS })).toBe(
            false
        );
    });

    it("treats a missing elapsed time as instant", () => {
        expect(looksAutomated({ ...human, elapsedMs: 0 })).toBe(true);
    });
});

describe("SubmitGuardSchema", () => {
    it("refuses a negative elapsed time", () => {
        // A client that can send -1 can send anything; the floor is only a
        // floor if the number it compares against is a real duration.
        expect(
            SubmitGuardSchema.safeParse({ hp: "", elapsedMs: -1 }).success
        ).toBe(false);
    });

    it("refuses a fractional elapsed time", () => {
        expect(
            SubmitGuardSchema.safeParse({ hp: "", elapsedMs: 1.5 }).success
        ).toBe(false);
    });

    it("keeps the floor well under any human's fastest honest answer", () => {
        // A respondent has to read a title and touch a control to get here.
        // Raising this is how a real submission gets refused, so it is asserted
        // rather than left to a comment.
        expect(MIN_SUBMIT_MS).toBeLessThanOrEqual(2_000);
    });
});
