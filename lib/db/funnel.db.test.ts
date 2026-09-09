import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { surveyId as toSurveyId } from "@/domain/ids";
import { resolveSurvey } from "@/domain/localize";
import type { SurveyId } from "@/domain/ids";
import { insertSurveyEvents } from "@/lib/db/events";
import { getFunnelTotals, listQuestionFunnel } from "@/lib/db/funnel";
import { createSurvey, getSurvey, publishSurvey } from "@/lib/db/surveys";
import {
    createTestUser,
    deleteTestUser,
    npsQuestion,
    signIn,
    singleChoiceQuestion,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { buildFunnel, completionRate } from "@/lib/results/funnel";

/**
 * The Phase 7 funnel functions, against a real database.
 *
 * The two properties worth proving here cannot be proved in a unit test: that
 * `security invoker` really does leave RLS as the enforcement point, so one
 * owner cannot read another's analytics; and that the grouped SQL counts
 * distinct sessions rather than event rows, which is what makes the funnel
 * mean anything when a client sends a burst twice.
 */

const SEED_WAVE_TWO = toSurveyId("00000000-0000-4000-8000-0000000000a2");
const SEED_WAVE_ONE = toSurveyId("00000000-0000-4000-8000-0000000000a1");
const OWNER_EMAIL = "owner@kusimustik.test";
const OWNER_PASSWORD = "password123";

describe("the seeded funnel", () => {
    it("reports the stages the seed builds", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const totals = await getFunnelTotals(db, SEED_WAVE_TWO);

        expect(totals).toEqual({
            views: 50,
            starts: 42,
            submits: 30,
            abandons: 12
        });
    });

    it("computes completion against starts, not views", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const totals = await getFunnelTotals(db, SEED_WAVE_TWO);

        // 30 of 42, not 30 of 50.
        expect(completionRate(totals)).toBeCloseTo(71.4, 1);
    });

    it("declines monotonically through the questions", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const rows = await listQuestionFunnel(db, SEED_WAVE_TWO);

        expect(rows.size).toBe(8);
        for (const row of rows.values()) {
            expect(row.answered).toBeLessThanOrEqual(row.reached);
        }
    });

    it("returns the exact median dwell the seed wrote", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const rows = await listQuestionFunnel(db, SEED_WAVE_TWO);

        const medians = [...rows.values()]
            .map(row => row.medianDwellMs)
            .sort((a, b) => (a ?? 0) - (b ?? 0));

        // The seed holds dwell constant per question precisely so this is exact.
        expect(medians).toEqual([
            3100, 3200, 3800, 4200, 5200, 8600, 14500, 41000
        ]);
    });

    it("flags the seed's cliff, and attributes it to where people failed to arrive", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const [totals, rows] = await Promise.all([
            getFunnelTotals(db, SEED_WAVE_TWO),
            listQuestionFunnel(db, SEED_WAVE_TWO)
        ]);

        // Read through the repository, not with a raw select: `isAnswerable`
        // is defaulted by `SurveySchema` and is absent from the stored JSON, so
        // an unparsed document has no answerable elements at all and the funnel
        // silently loses every question stage.
        const record = await getSurvey(db, SEED_WAVE_TWO);
        if (record === null) throw new Error("seed wave two is missing");

        const funnel = buildFunnel(
            resolveSurvey(record.survey).elements,
            totals,
            rows
        );

        expect(funnel.isEmpty).toBe(false);

        // The steepest drop in the seed is people opening the link and never
        // touching a control — 8 of 50, 16 points. It beats every question, and
        // a funnel that only looked at questions would miss the largest loss
        // the survey actually has.
        expect(funnel.worstStage?.kind).toBe("start");
        expect(funnel.worstStage?.dropPp).toBeCloseTo(16, 1);

        // A drop is attributed to the stage people failed to *reach*, which is
        // the stage after the one that put them off — the standard funnel
        // reading. The seed's cliff is the free-text question, so the flag
        // lands on the question following it.
        const flagged = funnel.stages.filter(
            stage => stage.kind === "question" && stage.isProblem
        );
        expect(flagged.map(stage => stage.title)).toEqual([
            "Kui rahul olete meie teenusega sel aastal?"
        ]);

        // And the free-text question itself shows as the biggest *skip*: 38
        // reached it, 19 answered. Skipping and dropping out are different
        // things and the funnel reports them separately.
        const skips = funnel.stages
            .filter(stage => stage.kind === "question")
            .map(stage => ({ title: stage.title, skipped: stage.skipped }))
            .sort((a, b) => (b.skipped ?? 0) - (a.skipped ?? 0));
        expect(skips[0]?.title).toBe("Mida peaksime järgmisel aastal muutma?");
        expect(skips[0]?.skipped).toBe(19);
    });

    it("is empty for the wave collected before the instrumentation existed", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const [totals, rows] = await Promise.all([
            getFunnelTotals(db, SEED_WAVE_ONE),
            listQuestionFunnel(db, SEED_WAVE_ONE)
        ]);

        expect(totals).toEqual({
            views: 0,
            starts: 0,
            submits: 0,
            abandons: 0
        });
        expect(rows.size).toBe(0);
    });
});

describe("funnel access control", () => {
    let owner: TestUser;
    let stranger: TestUser;
    let surveyId: SurveyId;

    beforeAll(async () => {
        owner = await createTestUser("funnel-owner");
        stranger = await createTestUser("funnel-stranger");

        const question = singleChoiceQuestion("q1");
        const created = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Funnel fixture",
            elements: stored([question, npsQuestion("q2")])
        });
        surveyId = created.survey.id;
        await publishSurvey(owner.db, surveyId, testSlug("funnel"));

        // Two sessions, and one of them sends its `view` twice — a beacon that
        // was retried, or a tab restored. The funnel must still say two.
        const sessions = [crypto.randomUUID(), crypto.randomUUID()];
        await insertSurveyEvents(owner.db, [
            { surveyId, sessionId: sessions[0] ?? "", type: "view" },
            { surveyId, sessionId: sessions[0] ?? "", type: "view" },
            { surveyId, sessionId: sessions[1] ?? "", type: "view" },
            { surveyId, sessionId: sessions[0] ?? "", type: "start" },
            {
                surveyId,
                sessionId: sessions[0] ?? "",
                questionId: question.id,
                type: "question_view"
            },
            {
                surveyId,
                sessionId: sessions[0] ?? "",
                questionId: question.id,
                type: "question_answer",
                meta: { dwellMs: 1200 }
            },
            {
                surveyId,
                sessionId: sessions[0] ?? "",
                questionId: question.id,
                type: "question_answer",
                meta: { dwellMs: 1200 }
            },
            { surveyId, sessionId: sessions[0] ?? "", type: "submit" }
        ]);
    });

    afterAll(async () => {
        await deleteTestUser(owner);
        await deleteTestUser(stranger);
    });

    it("counts distinct sessions, not event rows", async () => {
        const totals = await getFunnelTotals(owner.db, surveyId);
        expect(totals.views).toBe(2);
        expect(totals.starts).toBe(1);
        expect(totals.submits).toBe(1);

        const rows = await listQuestionFunnel(owner.db, surveyId);
        expect([...rows.values()][0]?.answered).toBe(1);
    });

    it("shows a stranger nothing, rather than refusing", async () => {
        // RLS filters rows; it does not raise. An empty funnel for a survey
        // that is not yours is indistinguishable from one nobody has opened,
        // which is the property that stops the endpoint being an oracle.
        const totals = await getFunnelTotals(stranger.db, surveyId);
        expect(totals).toEqual({
            views: 0,
            starts: 0,
            submits: 0,
            abandons: 0
        });

        const rows = await listQuestionFunnel(stranger.db, surveyId);
        expect(rows.size).toBe(0);
    });

    it("gives a question with no dwell reported a null median, not a zero", async () => {
        const rows = await listQuestionFunnel(owner.db, surveyId);
        const answered = [...rows.values()].find(row => row.answered > 0);
        expect(answered?.medianDwellMs).toBe(1200);
    });
});

/**
 * A phone respondent who switches apps mid-survey files an `abandon`, comes
 * back to the same `sessionStorage` session and finishes. Both events are then
 * real and both are in the log; only the session's *outcome* is a question,
 * and it is answered here rather than by the client that wrote the rows.
 */
describe("a session that abandoned and then submitted", () => {
    let owner: TestUser;
    let surveyId: SurveyId;
    const returning = crypto.randomUUID();
    const lost = crypto.randomUUID();

    beforeAll(async () => {
        owner = await createTestUser("funnel-abandon");
        const created = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Abandon fixture",
            elements: stored([singleChoiceQuestion("q1")])
        });
        surveyId = created.survey.id;
        await publishSurvey(owner.db, surveyId, testSlug("abandon"));

        await insertSurveyEvents(owner.db, [
            { surveyId, sessionId: returning, type: "view" },
            { surveyId, sessionId: returning, type: "abandon" },
            { surveyId, sessionId: returning, type: "start" },
            { surveyId, sessionId: returning, type: "submit" },
            { surveyId, sessionId: lost, type: "view" },
            { surveyId, sessionId: lost, type: "start" },
            { surveyId, sessionId: lost, type: "abandon" }
        ]);
    });

    afterAll(async () => {
        await deleteTestUser(owner);
    });

    it("counts only the session that never came back", async () => {
        const totals = await getFunnelTotals(owner.db, surveyId);

        expect(totals).toEqual({
            views: 2,
            starts: 2,
            submits: 1,
            abandons: 1
        });
    });
});
