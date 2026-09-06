import { describe, expect, it } from "vitest";

import { surveyId } from "@/domain/ids";
import type { SurveyStatus } from "@/domain/survey";
import {
    buildSurveyListRows,
    filterSurveyListRows,
    type SurveyListItem,
    type SurveyListRow
} from "@/lib/surveys/list";

/**
 * The list is grouped by wave group, and duplication is what creates a wave
 * group, so getting this wrong is the first thing an owner would see after
 * pressing "duplicate". It is pure, so it is tested here rather than through
 * the page.
 */

const OWNER_ID = "99999999-9999-4999-8999-999999999999";
const GROUP_A = "11111111-1111-4111-8111-111111111111";
const GROUP_B = "22222222-2222-4222-8222-222222222222";

let counter = 0;

function item(
    overrides: {
        readonly title?: string;
        readonly status?: SurveyStatus;
        readonly waveGroupId?: string;
        readonly waveLabel?: string | null;
        readonly updatedAt?: string;
        readonly responseCount?: number;
        readonly questionCount?: number;
        readonly slug?: string | null;
    } = {}
): SurveyListItem {
    counter += 1;
    const status = overrides.status ?? "draft";
    return {
        id: surveyId(crypto.randomUUID()),
        title: overrides.title ?? `Survey ${counter}`,
        description: null,
        status,
        slug: overrides.slug ?? (status === "draft" ? null : `slug-${counter}`),
        locale: "et",
        waveGroupId: overrides.waveGroupId ?? crypto.randomUUID(),
        waveLabel: overrides.waveLabel ?? null,
        ownerId: OWNER_ID,
        version: 1,
        publishedVersion: status === "draft" ? null : 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
        publishedAt: null,
        closedAt: null,
        responseCount: overrides.responseCount ?? 0,
        questionCount: overrides.questionCount ?? 0
    };
}

function titles(rows: readonly SurveyListRow[]): string[] {
    return rows.map(row => row.title);
}

describe("buildSurveyListRows", () => {
    it("leaves a lone survey ungrouped", () => {
        const rows = buildSurveyListRows([item({ title: "Pulss" })]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.kind).toBe("survey");
        expect(titles(rows)).toEqual(["Pulss"]);
    });

    it("gathers surveys sharing a wave group into one row, newest wave first", () => {
        const rows = buildSurveyListRows([
            item({
                title: "Maine 2024",
                waveGroupId: GROUP_A,
                waveLabel: "2024",
                updatedAt: "2024-02-04T00:00:00.000Z"
            }),
            item({
                title: "Maine 2026",
                waveGroupId: GROUP_A,
                waveLabel: "2026",
                updatedAt: "2026-09-06T09:15:00.000Z"
            }),
            item({
                title: "Maine 2025",
                waveGroupId: GROUP_A,
                waveLabel: "2025",
                updatedAt: "2026-01-12T00:00:00.000Z"
            })
        ]);

        expect(rows).toHaveLength(1);
        const [group] = rows;
        if (group?.kind !== "waveGroup") throw new Error("expected a group");

        expect(group.waves.map(wave => wave.waveLabel)).toEqual([
            "2026",
            "2025",
            "2024"
        ]);
        // The group is named for its newest wave: that is the wording the owner
        // last chose, and earlier waves keep whatever they were called.
        expect(group.title).toBe("Maine 2026");
    });

    it("aggregates the group's counts across its waves", () => {
        const rows = buildSurveyListRows([
            item({
                waveGroupId: GROUP_A,
                status: "published",
                updatedAt: "2026-09-06T00:00:00.000Z",
                responseCount: 412,
                questionCount: 8
            }),
            item({
                waveGroupId: GROUP_A,
                status: "closed",
                updatedAt: "2026-01-12T00:00:00.000Z",
                responseCount: 1642,
                questionCount: 7
            })
        ]);

        const [group] = rows;
        if (group?.kind !== "waveGroup") throw new Error("expected a group");

        expect(group.waveCount).toBe(2);
        expect(group.responseCount).toBe(412 + 1642);
        // The newest wave's, not the sum: it describes the questionnaire as it
        // stands today.
        expect(group.questionCount).toBe(8);
        expect(group.openCount).toBe(1);
        expect(group.updatedAt).toBe("2026-09-06T00:00:00.000Z");
    });

    it("orders rows by most recent activity, groups included", () => {
        const rows = buildSurveyListRows([
            item({ title: "Vana", updatedAt: "2025-01-01T00:00:00.000Z" }),
            item({
                title: "Rühm vana",
                waveGroupId: GROUP_A,
                updatedAt: "2024-01-01T00:00:00.000Z"
            }),
            item({
                title: "Rühm uus",
                waveGroupId: GROUP_A,
                updatedAt: "2026-06-01T00:00:00.000Z"
            }),
            item({ title: "Uus", updatedAt: "2026-03-01T00:00:00.000Z" })
        ]);

        expect(titles(rows)).toEqual(["Rühm uus", "Uus", "Vana"]);
    });

    it("keeps distinct wave groups apart", () => {
        const rows = buildSurveyListRows([
            item({ title: "A1", waveGroupId: GROUP_A }),
            item({ title: "A2", waveGroupId: GROUP_A }),
            item({ title: "B1", waveGroupId: GROUP_B }),
            item({ title: "B2", waveGroupId: GROUP_B })
        ]);

        expect(rows).toHaveLength(2);
        expect(rows.every(row => row.kind === "waveGroup")).toBe(true);
    });
});

describe("filterSurveyListRows", () => {
    const rows = buildSurveyListRows([
        item({ title: "Tudengite rahulolu", status: "draft" }),
        item({ title: "Klienditeeninduse tagasiside", status: "published" }),
        item({
            title: "Tööandja maine 2026",
            waveGroupId: GROUP_A,
            waveLabel: "2026",
            status: "published",
            updatedAt: "2026-09-06T00:00:00.000Z",
            responseCount: 412
        }),
        item({
            title: "Tööandja maine 2025",
            waveGroupId: GROUP_A,
            waveLabel: "2025",
            status: "closed",
            updatedAt: "2026-01-12T00:00:00.000Z",
            responseCount: 1642
        })
    ]);

    it("returns everything when nothing is asked of it", () => {
        expect(
            filterSurveyListRows(rows, { query: "", status: "all" })
        ).toEqual(rows);
    });

    it("matches titles case- and accent-insensitively", () => {
        expect(
            titles(
                filterSurveyListRows(rows, {
                    query: "tooandja",
                    status: "all"
                })
            )
        ).toEqual(["Tööandja maine 2026"]);
    });

    it("matches a wave by its label without losing the group around it", () => {
        const found = filterSurveyListRows(rows, {
            query: "2025",
            status: "all"
        });

        expect(found).toHaveLength(1);
        const [group] = found;
        if (group?.kind !== "waveGroup") throw new Error("expected a group");
        // Still a group, not promoted to a standalone survey: the wave belongs
        // to a series whether or not the filter shows its siblings.
        expect(group.waves.map(wave => wave.waveLabel)).toEqual(["2025"]);
    });

    it("narrows a group to its matching waves and recomputes its counts", () => {
        const found = filterSurveyListRows(rows, {
            query: "",
            status: "closed"
        });

        expect(found).toHaveLength(1);
        const [group] = found;
        if (group?.kind !== "waveGroup") throw new Error("expected a group");

        expect(group.waveCount).toBe(1);
        expect(group.responseCount).toBe(1642);
        expect(group.openCount).toBe(0);
        expect(group.title).toBe("Tööandja maine 2025");
    });

    it("drops a group no wave of which matches", () => {
        expect(
            filterSurveyListRows(rows, { query: "rahulolu", status: "all" })
        ).toHaveLength(1);
        expect(
            filterSurveyListRows(rows, { query: "puudub", status: "all" })
        ).toEqual([]);
    });

    it("applies query and status together", () => {
        expect(
            filterSurveyListRows(rows, {
                query: "tööandja",
                status: "published"
            })
        ).toHaveLength(1);
        expect(
            filterSurveyListRows(rows, { query: "tudengite", status: "closed" })
        ).toEqual([]);
    });
});
