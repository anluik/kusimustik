import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { suggestMatches } from "@/domain/comparison";
import { localizedText } from "@/domain/content";
import { comparisonId } from "@/domain/ids";
import type { ComparisonId } from "@/domain/ids";
import { loadComparisonView } from "@/lib/comparisons/load";
import { createComparison } from "@/lib/db/comparisons";
import { submitResponse } from "@/lib/db/responses";
import {
    createSurvey,
    publishSurvey,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    opinionScaleQuestion,
    signIn,
    singleChoiceQuestion,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { listWaveGroup } from "@/lib/db/waves";
import type { WaveComparison } from "@/lib/results/wave-comparison";

/**
 * The reads behind a drawn comparison, against the database: the seeded
 * comparison end to end, and a group whose questionnaire changed under a saved
 * comparison (docs/DECISIONS.md 035).
 */

const OWNER_EMAIL = "owner@kusimustik.test";
const OWNER_PASSWORD = "password123";
const SEEDED = comparisonId("00000000-0000-4000-8000-0000000000c1");

describe("the seeded comparison", () => {
    it("draws both waves, oldest first, with the responses each collected", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const view = await loadComparisonView(db, SEEDED);
        if (view === null) throw new Error("seeded comparison missing");

        expect(view.group.map(wave => wave.survey.waveLabel)).toEqual([
            "2025",
            "2026"
        ]);
        expect(view.comparison.waves.map(wave => wave.responseCount)).toEqual([
            30, 30
        ]);
        expect(view.comparison.rows).toHaveLength(8);
        for (const row of view.comparison.rows) {
            expect(row.comparedCount).toBe(2);
        }
    });

    it("summarises each wave against its own answers", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const view = await loadComparisonView(db, SEEDED);
        if (view === null) throw new Error("seeded comparison missing");

        // The seed's documented figures: satisfaction rose and the NPS went
        // from negative to positive between the two waves.
        const [nps2025, nps2026] = summaries(view.comparison, "nps");
        expect(nps2025?.kind === "nps" && nps2025.score).toBe(-10);
        expect(nps2026?.kind === "nps" && nps2026.score).toBe(40);

        const [scale2025, scale2026] = summaries(
            view.comparison,
            "opinion_scale"
        );
        expect(scale2025?.kind === "numeric" && scale2025.mean).toBe(3.17);
        expect(scale2026?.kind === "numeric" && scale2026.mean).toBe(4);

        // Reworded between the waves, and still one row — because the saved
        // comparison says so, not because anything matched the words.
        const satisfaction = rowOfType(view.comparison, "opinion_scale");
        const [older, newer] = satisfaction.cells;
        expect(
            older?.state === "compared" &&
                newer?.state === "compared" &&
                older.summary.title !== newer.summary.title
        ).toBe(true);
    });
});

describe("a group whose questionnaire changed under a saved comparison", () => {
    let owner: TestUser;
    let first: SurveyRecord;
    let second: SurveyRecord;
    let saved: ComparisonId;

    const role2025 = singleChoiceQuestion("role");
    const recommend2025 = npsQuestion("recommend");
    const extra2025 = npsQuestion("extra");
    const role2026 = singleChoiceQuestion("role");
    const recommend2026 = npsQuestion("recommend");
    const scale2026 = opinionScaleQuestion("fresh");

    beforeAll(async () => {
        owner = await createTestUser("waves");

        first = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Annual survey"),
            waveLabel: "2025",
            elements: stored([role2025, recommend2025, extra2025])
        });
        second = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Annual survey, reworded"),
            waveGroupId: first.survey.waveGroupId,
            waveLabel: "2026",
            elements: stored([role2026, recommend2026, scale2026])
        });

        first = await publishSurvey(owner.db, first.survey.id, testSlug("w25"));
        await publishSurvey(owner.db, second.survey.id, testSlug("w26"));

        const anon = anonClient();
        for (const value of ["yes", "yes", "no"]) {
            await submitResponse(anon, {
                surveyId: first.survey.id,
                answers: [
                    {
                        questionId: role2025.id,
                        value: { type: "single_choice", value }
                    },
                    {
                        questionId: extra2025.id,
                        value: { type: "nps", value: 9 }
                    }
                ]
            });
        }
        await submitResponse(anon, {
            surveyId: second.survey.id,
            answers: [
                {
                    questionId: role2026.id,
                    value: { type: "single_choice", value: "yes" }
                }
            ]
        });

        const group = await listWaveGroup(owner.db, first.survey.waveGroupId);
        const waves = group.map(wave => ({
            surveyId: wave.survey.id,
            elements: wave.survey.elements
        }));
        saved = await createComparison(owner.db, {
            waveGroupId: first.survey.waveGroupId,
            document: {
                name: "2025 – 2026",
                surveyIds: waves.map(wave => wave.surveyId),
                rows: suggestMatches({
                    waves,
                    rows: [],
                    scope: { kind: "all" }
                })
            }
        });

        // `extra` leaves 2025 after it was answered: tombstoned, not deleted.
        await updateSurveyDefinition(owner.db, first.survey.id, first.version, {
            elements: stored([role2025, recommend2025])
        });
    });

    afterAll(async () => {
        await deleteTestUser(owner);
    });

    it("compares the rows the owner saved, each wave against its own answers", async () => {
        const view = await loadComparisonView(owner.db, saved);
        const comparison = view?.comparison;
        if (comparison === undefined) throw new Error("comparison missing");

        const role = rowOfType(comparison, "single_choice");
        expect(role.question.id).toBe(role2026.id);
        const [older, newer] = role.cells;
        if (older?.state !== "compared" || newer?.state !== "compared") {
            throw new Error("both waves should have been compared");
        }
        expect(older.summary.questionId).toBe(role2025.id);
        expect(older.summary.responseCount).toBe(3);
        expect(newer.summary.responseCount).toBe(1);
        expect(
            older.summary.kind === "categorical" &&
                older.summary.options.map(option => option.count)
        ).toEqual([2, 1]);
    });

    it("never suggested a question with nothing to match", async () => {
        const view = await loadComparisonView(owner.db, saved);
        const comparison = view?.comparison;
        if (comparison === undefined) throw new Error("comparison missing");

        // role and recommend matched by lineage; `fresh` in 2026 and `extra`
        // in 2025 had no counterpart, so no row was invented for either.
        expect(comparison.rows).toHaveLength(2);
    });

    it("shows another owner nothing", async () => {
        const stranger = await createTestUser("waves-stranger");
        try {
            expect(await loadComparisonView(stranger.db, saved)).toBeNull();
            expect(
                await listWaveGroup(stranger.db, first.survey.waveGroupId)
            ).toEqual([]);
        } finally {
            await deleteTestUser(stranger);
        }
    });
});

function rowOfType(comparison: WaveComparison, type: string) {
    const found = comparison.rows.find(row => row.question.type === type);
    if (found === undefined) throw new Error(`no ${type} row`);
    return found;
}

/** The summaries for the row of one question type, wave by wave. */
function summaries(comparison: WaveComparison, type: string) {
    return rowOfType(comparison, type).cells.map(cell =>
        cell.state === "compared" ? cell.summary : undefined
    );
}
