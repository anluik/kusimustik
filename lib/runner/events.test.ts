import { describe, expect, it } from "vitest";

import { surveyId } from "@/domain/ids";
import { EventBatchSchema, stampEvents } from "@/lib/runner/events";

const RECEIVED_AT = Date.parse("2026-09-06T12:00:00.000Z");

const batch = EventBatchSchema.parse({
    surveyId: surveyId("11111111-1111-4111-8111-111111111111"),
    sessionId: "44444444-4444-4444-8444-444444444444",
    sentAtOffsetMs: 10_000,
    events: [
        { type: "view", offsetMs: 0, meta: { device: "mobile" } },
        { type: "start", offsetMs: 2_500 },
        { type: "submit", offsetMs: 9_000 }
    ]
});

describe("stampEvents", () => {
    it("anchors the batch to the server clock, keeping the spacing", () => {
        const stamped = stampEvents(batch, RECEIVED_AT);
        expect(stamped.map(event => event.at)).toEqual([
            "2026-09-06T11:59:50.000Z",
            "2026-09-06T11:59:52.500Z",
            "2026-09-06T11:59:59.000Z"
        ]);
    });

    it("carries the session and flattens an absent question to null", () => {
        const [view] = stampEvents(batch, RECEIVED_AT);
        expect(view).toMatchObject({
            sessionId: "44444444-4444-4444-8444-444444444444",
            questionId: null,
            type: "view",
            meta: { device: "mobile" }
        });
    });

    it("clamps an offset that would back-date the event", () => {
        // A hand-made request must not be able to file events into a report
        // that has already been read.
        const forged = { ...batch, sentAtOffsetMs: 10 ** 12 };
        const [first] = stampEvents(forged, RECEIVED_AT);
        expect(first?.at).toBe("2026-09-06T06:00:00.000Z");
    });

    it("clamps an offset from the future to the moment it arrived", () => {
        const skewed = {
            ...batch,
            events: [{ type: "view" as const, offsetMs: 99_999 }]
        };
        const [first] = stampEvents(skewed, RECEIVED_AT);
        expect(first?.at).toBe("2026-09-06T12:00:00.000Z");
    });
});

describe("EventBatchSchema", () => {
    it("refuses an empty or oversized batch", () => {
        const base = { ...batch, events: [] };
        expect(EventBatchSchema.safeParse(base).success).toBe(false);

        const flood = {
            ...batch,
            events: Array.from({ length: 51 }, () => ({
                type: "view",
                offsetMs: 0
            }))
        };
        expect(EventBatchSchema.safeParse(flood).success).toBe(false);
    });

    it("refuses an event type the database has never heard of", () => {
        const bogus = {
            ...batch,
            events: [{ type: "keystroke", offsetMs: 0 }]
        };
        expect(EventBatchSchema.safeParse(bogus).success).toBe(false);
    });
});
