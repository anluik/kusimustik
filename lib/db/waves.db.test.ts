import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { waveGroupId } from "@/domain/ids";
import type { WaveGroupId } from "@/domain/ids";
import { submitResponse } from "@/lib/db/responses";
import { createSurvey, listSurveys, publishSurvey } from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    opinionScaleQuestion,
    shortTextQuestion,
    signIn,
    singleChoiceQuestion,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import type { Db } from "@/lib/db/types";
import { listWaveGroupResponses } from "@/lib/db/waves";
import { buildWaveComparison } from "@/lib/results/wave-comparison";

/**
 * The read behind wave comparison, and the join it exists to make possible.
 *
 * The load-bearing claim is that two waves line up on `key` and on nothing else
 * (docs/DECISIONS.md 003): the question ids differ by construction, the titles
 * differ because owners reword them, and if the join ever quietly fell back to
 * either one the failure would be silent and a year old before anyone saw it.
 * So it is proved here, against the database, before any of it is drawn.
 */

const OWNER_EMAIL = "owner@kusimustik.test";
const OWNER_PASSWORD = "password123";

describe("the seeded wave group", () => {
    it("comes back oldest first, with the responses each wave collected", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await listWaveGroupResponses(db, await seededGroup(db));

        expect(waves.map(wave => wave.survey.waveLabel)).toEqual([
            "2025",
            "2026"
        ]);
        expect(waves.map(wave => wave.responses.length)).toEqual([30, 30]);

        // Each wave's responses are its own: a response carries the survey it
        // was submitted to, and nothing here may mix them.
        for (const wave of waves) {
            for (const response of wave.responses) {
                expect(response.surveyId).toBe(wave.survey.id);
            }
        }
    });

    it("aligns every question on key across waves that reworded them", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await listWaveGroupResponses(db, await seededGroup(db));
        const comparison = buildWaveComparison(waves);

        // Eight answerable questions; the statement block is not one of them.
        expect(comparison.questions.map(question => question.key)).toEqual([
            "role",
            "channels",
            "country",
            "city",
            "feedback",
            "satisfaction",
            "recommend",
            "team_ratings"
        ]);
        expect(comparison.omittedWaveCount).toBe(0);

        for (const question of comparison.questions) {
            expect(question.comparedCount).toBe(2);
            expect(question.missingCount).toBe(0);
        }

        // The join is on key alone. `satisfaction` is worded differently in the
        // two waves and carries different question ids, and both waves are
        // still summarised under the one card.
        const satisfaction = questionByKey(comparison, "satisfaction");
        const [older, newer] = satisfaction.cells;
        if (older?.state !== "compared" || newer?.state !== "compared") {
            throw new Error("both waves should have been compared");
        }
        expect(older.summary.questionId).not.toBe(newer.summary.questionId);
        expect(older.summary.title).not.toBe(newer.summary.title);
        expect(older.summary.questionKey).toBe(newer.summary.questionKey);

        // The card is titled with the newest wave's wording.
        expect(satisfaction.question.title).toBe(newer.summary.title);
    });

    it("summarises each wave against its own answers", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await listWaveGroupResponses(db, await seededGroup(db));
        const comparison = buildWaveComparison(waves);

        // The seed's documented figures, reached through the comparison rather
        // than by picking the questions out by hand: satisfaction rose and the
        // NPS went from negative to positive between the two waves.
        const [nps2025, nps2026] = summaries(comparison, "recommend");
        expect(nps2025?.kind === "nps" && nps2025.score).toBe(-10);
        expect(nps2026?.kind === "nps" && nps2026.score).toBe(40);

        const [scale2025, scale2026] = summaries(comparison, "satisfaction");
        expect(scale2025?.kind === "numeric" && scale2025.mean).toBe(3.17);
        expect(scale2026?.kind === "numeric" && scale2026.mean).toBe(4);

        for (const summary of [nps2025, nps2026, scale2025, scale2026]) {
            expect(summary?.responseCount).toBe(30);
        }
    });
});

describe("a wave group whose questionnaire changed", () => {
    let owner: TestUser;
    let group: WaveGroupId;
    let first: SurveyRecord;
    let second: SurveyRecord;

    // Wave one asks four questions. Wave two drops `extra`, keeps `role` and
    // `recommend` under fresh question ids, and reuses the key `city` for a
    // question of an entirely different type — which is the edit that would
    // otherwise put two incompatible summaries on one card.
    const role2025 = singleChoiceQuestion("role");
    const recommend2025 = npsQuestion("recommend");
    const city2025 = shortTextQuestion("city");
    const extra2025 = npsQuestion("extra");

    const role2026 = singleChoiceQuestion("role");
    const recommend2026 = npsQuestion("recommend");
    const city2026 = opinionScaleQuestion("city");

    beforeAll(async () => {
        owner = await createTestUser("waves");

        first = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Annual survey",
            waveLabel: "2025",
            elements: [role2025, recommend2025, city2025, extra2025]
        });
        group = first.survey.waveGroupId;

        second = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Annual survey, reworded",
            waveGroupId: group,
            waveLabel: "2026",
            elements: [role2026, recommend2026, city2026]
        });

        await publishSurvey(owner.db, first.survey.id, testSlug("wave-2025"));
        await publishSurvey(owner.db, second.survey.id, testSlug("wave-2026"));

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
    });

    afterAll(async () => {
        await deleteTestUser(owner);
    });

    it("joins the two waves on key, not on question id", async () => {
        const comparison = buildWaveComparison(
            await listWaveGroupResponses(owner.db, group)
        );

        const role = questionByKey(comparison, "role");
        // The reference is the newest wave's question…
        expect(role.question.id).toBe(role2026.id);
        // …and the older wave's summary is its own question, on the same key.
        const [older, newer] = role.cells;
        if (older?.state !== "compared" || newer?.state !== "compared") {
            throw new Error("both waves should have been compared");
        }
        expect(older.summary.questionId).toBe(role2025.id);
        expect(newer.summary.questionId).toBe(role2026.id);

        // Each wave counted only its own respondents.
        expect(older.summary.responseCount).toBe(3);
        expect(newer.summary.responseCount).toBe(1);
        expect(
            older.summary.kind === "categorical" &&
                older.summary.options.map(option => option.count)
        ).toEqual([2, 1]);
        expect(
            newer.summary.kind === "categorical" &&
                newer.summary.options.map(option => option.count)
        ).toEqual([1, 0]);
    });

    it("reports a question the newer wave stopped asking rather than dropping it", async () => {
        const comparison = buildWaveComparison(
            await listWaveGroupResponses(owner.db, group)
        );

        // Keys only the older wave has come last, after the current
        // questionnaire, but they are still there — the answers exist.
        expect(comparison.questions.map(question => question.key)).toEqual([
            "role",
            "recommend",
            "city",
            "extra"
        ]);

        const extra = questionByKey(comparison, "extra");
        expect(extra.cells.map(cell => cell.state)).toEqual([
            "compared",
            "absent"
        ]);
        expect(extra.comparedCount).toBe(1);
        expect(extra.missingCount).toBe(1);
    });

    it("refuses to compare a key that changed type between waves", async () => {
        const comparison = buildWaveComparison(
            await listWaveGroupResponses(owner.db, group)
        );

        const city = questionByKey(comparison, "city");
        // The reference is the newest definition, so the older wave — a short
        // text question — is the one reported as incomparable.
        expect(city.question.type).toBe("opinion_scale");
        expect(city.cells.map(cell => cell.state)).toEqual([
            "mismatched",
            "compared"
        ]);
        expect(
            city.cells[0]?.state === "mismatched" && city.cells[0].type
        ).toBe("short_text");
    });

    it("shows another owner nothing, group id or not", async () => {
        const stranger = await createTestUser("waves-stranger");
        try {
            expect(await listWaveGroupResponses(stranger.db, group)).toEqual(
                []
            );
        } finally {
            await deleteTestUser(stranger);
        }
    });
});

async function seededGroup(db: Db): Promise<WaveGroupId> {
    const summaries = await listSurveys(db);
    const group = summaries[0]?.waveGroupId;
    if (group === undefined) throw new Error("the seed has no surveys");
    return waveGroupId(group);
}

function questionByKey(
    comparison: ReturnType<typeof buildWaveComparison>,
    key: string
) {
    const found = comparison.questions.find(question => question.key === key);
    if (found === undefined) throw new Error(`no compared question ${key}`);
    return found;
}

/** The summaries for one key, wave by wave; undefined where uncompared. */
function summaries(
    comparison: ReturnType<typeof buildWaveComparison>,
    key: string
) {
    return questionByKey(comparison, key).cells.map(cell =>
        cell.state === "compared" ? cell.summary : undefined
    );
}
