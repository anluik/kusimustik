import { describe, expect, it } from "vitest";

import { APP_TIME_ZONE } from "@/lib/i18n/locales";
import { describeTimestamp } from "@/lib/surveys/format";

/**
 * "Today" is a question about a calendar day in a time zone, not about a
 * number of elapsed hours: 00:30 and 23:30 on the same date are both today
 * even though they are 23 hours apart, and 23:30 followed by 00:30 is
 * yesterday even though it is one hour. The zone is pinned (DESIGN §9), so the
 * answer does not change with where the browser happens to be.
 */

const zone = APP_TIME_ZONE;

describe("describeTimestamp", () => {
    it("calls the same calendar day today, however many hours apart", () => {
        const now = new Date("2026-09-06T20:30:00+03:00");

        expect(
            describeTimestamp("2026-09-06T00:30:00+03:00", now, zone)
        ).toEqual({ kind: "today" });
        expect(
            describeTimestamp("2026-09-06T20:29:00+03:00", now, zone)
        ).toEqual({ kind: "today" });
    });

    it("calls the previous calendar day yesterday, however few hours apart", () => {
        const now = new Date("2026-09-06T00:30:00+03:00");

        expect(
            describeTimestamp("2026-09-05T23:30:00+03:00", now, zone)
        ).toEqual({ kind: "yesterday" });
    });

    it("falls back to a date for anything older", () => {
        const now = new Date("2026-09-06T12:00:00+03:00");

        expect(
            describeTimestamp("2026-09-04T23:59:00+03:00", now, zone)
        ).toEqual({ kind: "date" });
        expect(
            describeTimestamp("2025-10-31T12:00:00+03:00", now, zone)
        ).toEqual({ kind: "date" });
    });

    it("answers in the pinned zone, not the runtime's", () => {
        // 22:30 UTC on the 5th is already 01:30 on the 6th in Tallinn, so a
        // browser in London and one in Tallinn must agree that it is today.
        const now = new Date("2026-09-06T05:00:00Z");

        expect(describeTimestamp("2026-09-05T22:30:00Z", now, zone)).toEqual({
            kind: "today"
        });
        expect(describeTimestamp("2026-09-05T20:30:00Z", now, zone)).toEqual({
            kind: "yesterday"
        });
    });

    it("does not call a future timestamp yesterday", () => {
        const now = new Date("2026-09-06T12:00:00+03:00");

        expect(
            describeTimestamp("2026-09-07T09:00:00+03:00", now, zone)
        ).toEqual({ kind: "date" });
    });

    it("crosses a month boundary correctly", () => {
        const now = new Date("2026-11-01T09:00:00+02:00");

        expect(
            describeTimestamp("2026-10-31T23:00:00+02:00", now, zone)
        ).toEqual({ kind: "yesterday" });
    });
});
