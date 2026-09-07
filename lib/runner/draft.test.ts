import { describe, expect, it } from "vitest";

import { ALL_ELEMENTS, Q, singleChoice } from "@/domain/test-fixtures";
import { deserialiseDraft, serialiseDraft } from "@/lib/runner/draft";
import type { AnswerDraft } from "@/lib/runner/validation";

const NOW = 1_800_000_000_000;

const DRAFT: AnswerDraft = {
    [Q.role]: { type: "single_choice", value: "dev" },
    [Q.recommend]: { type: "nps", value: 7 }
};

function roundTrip(draft: AnswerDraft, at = NOW): AnswerDraft {
    return deserialiseDraft(ALL_ELEMENTS, serialiseDraft(draft, at), NOW);
}

describe("draft round trip", () => {
    it("restores what was stored", () => {
        expect(roundTrip(DRAFT)).toEqual(DRAFT);
    });

    it("drops cleared answers rather than storing them as null", () => {
        expect(roundTrip({ ...DRAFT, [Q.city]: null })).toEqual(DRAFT);
    });

    it("restores nothing from a draft older than a week", () => {
        expect(roundTrip(DRAFT, NOW - 8 * 24 * 60 * 60 * 1_000)).toEqual({});
    });
});

describe("deserialiseDraft", () => {
    it("survives absent, unparseable and misshapen storage", () => {
        for (const raw of [
            null,
            "{",
            "[]",
            '{"answers":{}}',
            '{"savedAt":1}'
        ]) {
            expect(deserialiseDraft(ALL_ELEMENTS, raw, NOW)).toEqual({});
        }
    });

    it("drops an answer whose question has left the document", () => {
        const stored = serialiseDraft(DRAFT, NOW);
        expect(deserialiseDraft([singleChoice], stored, NOW)).toEqual({
            [Q.role]: { type: "single_choice", value: "dev" }
        });
    });

    it("drops an answer whose question changed type under it", () => {
        // The version in the storage key normally prevents this; the check is
        // here because a dropped answer is recoverable and a form that cannot
        // be submitted for an invisible reason is not.
        const stored = JSON.stringify({
            savedAt: NOW,
            answers: { [Q.role]: { type: "nps", value: 4 } }
        });
        expect(deserialiseDraft(ALL_ELEMENTS, stored, NOW)).toEqual({});
    });

    it("drops an answer whose envelope no longer parses", () => {
        const stored = JSON.stringify({
            savedAt: NOW,
            answers: {
                [Q.recommend]: { type: "nps", value: "seven" },
                [Q.role]: { type: "single_choice", value: "dev" }
            }
        });
        // The record schema rejects the whole map, which is the safe direction:
        // a corrupt store starts the respondent afresh rather than half-filled.
        expect(deserialiseDraft(ALL_ELEMENTS, stored, NOW)).toEqual({});
    });
});
