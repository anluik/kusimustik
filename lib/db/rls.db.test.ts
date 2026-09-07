import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ResponseId, SurveyId } from "@/domain/ids";
import { newQuestionId } from "@/domain/ids";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    singleChoiceQuestion,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { insertSurveyEvents } from "@/lib/db/events";
import { getProfile, updateDisplayName } from "@/lib/db/profiles";
import {
    countResponses,
    listResponses,
    submitResponse
} from "@/lib/db/responses";
import {
    closeSurvey,
    createSurvey,
    getRunnerSurveyBySlug,
    getSurvey,
    publishSurvey
} from "@/lib/db/surveys";

/**
 * The policies that matter: an owner's responses are private to them, and an
 * anonymous respondent may write into a published survey and nothing else.
 */

// A question id is a primary key across the whole projection table, so every
// survey gets its own element objects.
const nps = npsQuestion("recommend");
const choice = singleChoiceQuestion("role");
const draftNps = npsQuestion("recommend");
const closedNps = npsQuestion("recommend");

let owner: TestUser;
let stranger: TestUser;
let publishedId: SurveyId;
let publishedSlug: string;
let draftId: SurveyId;
let closedId: SurveyId;
let closedSlug: string;
let closedResponseId: ResponseId;

beforeAll(async () => {
    [owner, stranger] = await Promise.all([
        createTestUser("owner"),
        createTestUser("stranger")
    ]);

    const published = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: "Published survey",
        elements: [choice, nps]
    });
    publishedSlug = testSlug("published");
    publishedId = (
        await publishSurvey(owner.db, published.survey.id, publishedSlug)
    ).survey.id;

    const draft = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: "Draft survey",
        elements: [draftNps]
    });
    draftId = draft.survey.id;

    const closed = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: "Closed survey",
        elements: [closedNps]
    });
    closedSlug = testSlug("closed");
    await publishSurvey(owner.db, closed.survey.id, closedSlug);
    // Answered while it was live, so the answers policy can be tested against
    // an existing response after the survey stops accepting new ones.
    closedResponseId = await submitResponse(anonClient(), {
        surveyId: closed.survey.id,
        answers: [
            { questionId: closedNps.id, value: { type: "nps", value: 7 } }
        ]
    });
    closedId = (await closeSurvey(owner.db, closed.survey.id)).survey.id;

    await submitResponse(anonClient(), {
        surveyId: publishedId,
        answers: [
            {
                questionId: choice.id,
                value: { type: "single_choice", value: "yes" }
            },
            { questionId: nps.id, value: { type: "nps", value: 9 } }
        ],
        locale: "et"
    });
});

afterAll(async () => {
    await Promise.all([deleteTestUser(owner), deleteTestUser(stranger)]);
});

describe("a second user cannot read the first user's responses", () => {
    it("gives the owner their own responses", async () => {
        const responses = await listResponses(owner.db, publishedId);
        expect(responses).toHaveLength(1);
        expect(responses[0]?.answers[nps.id]).toEqual({
            type: "nps",
            value: 9
        });
        await expect(countResponses(owner.db, publishedId)).resolves.toBe(1);
    });

    it("hides the survey itself from another signed-in user", async () => {
        await expect(getSurvey(stranger.db, publishedId)).resolves.toBeNull();
    });

    it("hides the responses and answers from another signed-in user", async () => {
        await expect(listResponses(stranger.db, publishedId)).resolves.toEqual(
            []
        );
        await expect(countResponses(stranger.db, publishedId)).resolves.toBe(0);

        const rows = await stranger.db
            .from("answers")
            .select("response_id, question_id, value");
        expect(rows.error).toBeNull();
        expect(rows.data).toEqual([]);
    });

    it("hides the derived question projection from another signed-in user", async () => {
        const rows = await stranger.db
            .from("survey_questions")
            .select("question_id")
            .eq("survey_id", publishedId);
        expect(rows.data).toEqual([]);
    });

    it("does not let another signed-in user delete them", async () => {
        const deleted = await stranger.db
            .from("responses")
            .delete()
            .eq("survey_id", publishedId);
        expect(deleted.error).toBeNull();
        await expect(countResponses(owner.db, publishedId)).resolves.toBe(1);
    });

    it("refuses an anonymous client outright", async () => {
        const rows = await anonClient().from("responses").select("id");
        expect(rows.error?.code).toBe("42501");
    });
});

describe("a profile is private to its owner", () => {
    it("lets the owner read and rename themselves", async () => {
        await updateDisplayName(owner.db, owner.id, "Kadri");
        const profile = await getProfile(owner.db, owner.id);
        expect(profile?.email).toBe(owner.email);
        expect(profile?.displayName).toBe("Kadri");
    });

    it("hides it from another signed-in user", async () => {
        await expect(getProfile(stranger.db, owner.id)).resolves.toBeNull();

        const renamed = await stranger.db
            .from("profiles")
            .update({ display_name: "Not Kadri" })
            .eq("id", owner.id);
        expect(renamed.error).toBeNull();
        await expect(
            getProfile(owner.db, owner.id).then(p => p?.displayName)
        ).resolves.toBe("Kadri");
    });

    it("hides published definition snapshots from another signed-in user", async () => {
        const mine = await owner.db
            .from("survey_versions")
            .select("version")
            .eq("survey_id", publishedId);
        expect(mine.data).toHaveLength(1);

        const theirs = await stranger.db
            .from("survey_versions")
            .select("version")
            .eq("survey_id", publishedId);
        expect(theirs.data).toEqual([]);
    });
});

describe("an anonymous client may only write into a published survey", () => {
    it("accepts a response to a published survey", async () => {
        const id = await submitResponse(anonClient(), {
            surveyId: publishedId,
            answers: [{ questionId: nps.id, value: { type: "nps", value: 3 } }]
        });
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        await expect(countResponses(owner.db, publishedId)).resolves.toBe(2);
    });

    it("rejects a response to a draft survey", async () => {
        await expect(
            submitResponse(anonClient(), {
                surveyId: draftId,
                answers: [
                    {
                        questionId: draftNps.id,
                        value: { type: "nps", value: 3 }
                    }
                ]
            })
        ).rejects.toThrow();
        await expect(countResponses(owner.db, draftId)).resolves.toBe(0);
    });

    it("rejects a bare insert into responses for a draft survey", async () => {
        // A draft has no published version at all, so the before-insert trigger
        // turns it away before the policy is even consulted.
        const inserted = await anonClient()
            .from("responses")
            .insert({ survey_id: draftId, survey_version: 1 });
        expect(inserted.error).not.toBeNull();
        await expect(countResponses(owner.db, draftId)).resolves.toBe(0);
    });

    it("rejects a bare insert into responses for a closed survey with a policy violation", async () => {
        // A closed survey does have a published version, so this one reaches
        // the RLS check and is refused by it.
        const inserted = await anonClient()
            .from("responses")
            .insert({ survey_id: closedId, survey_version: 1 });
        expect(inserted.error?.code).toBe("42501");
    });

    it("rejects an answer added to an existing response once the survey is closed", async () => {
        const inserted = await anonClient()
            .from("answers")
            .insert({
                response_id: closedResponseId,
                survey_id: closedId,
                question_id: closedNps.id,
                value: { type: "nps", value: 0 }
            });
        expect(inserted.error?.code).toBe("42501");

        const responses = await listResponses(owner.db, closedId);
        expect(responses).toHaveLength(1);
        expect(responses[0]?.answers[closedNps.id]).toEqual({
            type: "nps",
            value: 7
        });
    });

    it("rejects a response to a closed survey", async () => {
        await expect(
            submitResponse(anonClient(), {
                surveyId: closedId,
                answers: [
                    {
                        questionId: closedNps.id,
                        value: { type: "nps", value: 3 }
                    }
                ]
            })
        ).rejects.toThrow();
    });

    it("accepts analytics events for a published survey and refuses them for a draft", async () => {
        const sessionId = crypto.randomUUID();
        await expect(
            insertSurveyEvents(anonClient(), [
                { surveyId: publishedId, sessionId, type: "view" },
                {
                    surveyId: publishedId,
                    sessionId,
                    questionId: nps.id,
                    type: "question_view"
                }
            ])
        ).resolves.toBeUndefined();

        await expect(
            insertSurveyEvents(anonClient(), [
                { surveyId: draftId, sessionId, type: "view" }
            ])
        ).rejects.toThrow();

        const events = await owner.db
            .from("survey_events")
            .select("type")
            .eq("survey_id", publishedId);
        expect(events.data).toHaveLength(2);
    });

    it("reaches a published survey by slug and nothing else", async () => {
        const survey = await getRunnerSurveyBySlug(anonClient(), publishedSlug);
        expect(survey?.survey.id).toBe(publishedId);
        expect(survey?.survey.elements).toHaveLength(2);
        expect(survey?.publishedVersion).toBe(1);

        await expect(
            getRunnerSurveyBySlug(anonClient(), testSlug("nope"))
        ).resolves.toBeNull();

        // A closed survey is still reachable so the runner can say it is
        // closed rather than 404 (DECISIONS 016) — while the insert policy
        // still refuses an answer to it, which the submission test covers.
        const closed = await getRunnerSurveyBySlug(anonClient(), closedSlug);
        expect(closed?.survey.id).toBe(closedId);
        expect(closed?.survey.status).toBe("closed");

        // Not enumerable: the table itself is closed to anonymous clients.
        const listed = await anonClient().from("surveys").select("id");
        expect(listed.error?.code).toBe("42501");
    });

    it("cannot attach an answer to a question of another survey", async () => {
        await expect(
            submitResponse(anonClient(), {
                surveyId: publishedId,
                answers: [
                    {
                        questionId: newQuestionId(),
                        value: { type: "nps", value: 3 }
                    }
                ]
            })
        ).rejects.toThrow();
    });
});
