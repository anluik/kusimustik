import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    shortTextQuestion,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { DbConflictError } from "@/lib/db/errors";
import { listResponses, submitResponse } from "@/lib/db/responses";
import {
    closeSurvey,
    createSurvey,
    getRunnerSurveyBySlug,
    publishSurvey,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";

/**
 * Versioning: the optimistic-concurrency token the builder saves against, and
 * the immutable snapshot a response is pinned to. An owner editing a live
 * survey must not rewrite what earlier respondents actually answered
 * (docs/DECISIONS.md 001).
 */

const recommend = npsQuestion("recommend");
const city = shortTextQuestion("city");

let owner: TestUser;
let survey: SurveyRecord;
let slug: string;

beforeAll(async () => {
    owner = await createTestUser("versions");
    survey = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: "Versioned",
        elements: [recommend]
    });
    slug = testSlug("versioned");
});

afterAll(async () => {
    await deleteTestUser(owner);
});

describe("survey versioning", () => {
    it("starts unpublished at version 1", () => {
        expect(survey.version).toBe(1);
        expect(survey.publishedVersion).toBeNull();
        expect(survey.survey.status).toBe("draft");
        expect(survey.survey.slug).toBeNull();
    });

    it("bumps the version when the definition changes and not otherwise", async () => {
        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { waveLabel: "2026" }
        );
        expect(survey.version).toBe(1);
        expect(survey.survey.waveLabel).toBe("2026");

        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { elements: [recommend, city] }
        );
        expect(survey.version).toBe(2);
    });

    it("refuses a save made against a stale version", async () => {
        await expect(
            updateSurveyDefinition(owner.db, survey.survey.id, 1, {
                title: "Written over"
            })
        ).rejects.toBeInstanceOf(DbConflictError);
    });

    it("snapshots the definition on publish", async () => {
        survey = await publishSurvey(owner.db, survey.survey.id, slug);
        expect(survey.publishedVersion).toBe(survey.version);
        expect(survey.publishedAt).not.toBeNull();

        const published = await getRunnerSurveyBySlug(anonClient(), slug);
        expect(published?.survey.elements.map(element => element.key)).toEqual([
            "recommend",
            "city"
        ]);
    });

    it("pins a response to the version that was live when it was submitted", async () => {
        await submitResponse(anonClient(), {
            surveyId: survey.survey.id,
            answers: [
                { questionId: recommend.id, value: { type: "nps", value: 8 } }
            ]
        });
        const atPublish = survey.version;

        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { elements: [recommend] }
        );
        expect(survey.version).toBe(atPublish + 1);
        expect(survey.publishedVersion).toBe(survey.version);

        const [response] = await listResponses(owner.db, survey.survey.id);
        expect(response?.surveyVersion).toBe(atPublish);

        const snapshots = await owner.db
            .from("survey_versions")
            .select("version, elements")
            .eq("survey_id", survey.survey.id)
            .order("version", { ascending: true });
        expect(snapshots.data?.map(row => row.version)).toEqual([
            atPublish,
            atPublish + 1
        ]);
    });

    it("does not rewrite the live snapshot when a closed survey is edited", async () => {
        const closed = await closeSurvey(owner.db, survey.survey.id);
        const liveVersion = closed.publishedVersion;

        const edited = await updateSurveyDefinition(
            owner.db,
            closed.survey.id,
            closed.version,
            { title: "Edited after closing" }
        );
        expect(edited.version).toBe(closed.version + 1);
        expect(edited.publishedVersion).toBe(liveVersion);

        const snapshot = await owner.db
            .from("survey_versions")
            .select("title")
            .eq("survey_id", closed.survey.id)
            .eq("version", liveVersion ?? 0)
            .single();
        expect(snapshot.data?.title).toBe("Versioned");
    });
});
