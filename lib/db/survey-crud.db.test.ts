import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { duplicateSurvey } from "@/domain/duplicate";
import { SurveySlugSchema } from "@/domain/survey";
import {
    createTestUser,
    deleteTestUser,
    npsQuestion,
    shortTextQuestion,
    singleChoiceQuestion,
    statementElement
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { submitResponse } from "@/lib/db/responses";
import {
    closeSurvey,
    createSurvey,
    deleteSurvey,
    getSurvey,
    listSurveyStats,
    listSurveys,
    publishSurveyDerivingSlug,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";

/**
 * Phase 4's database surface: slug assignment on publish, the counts the list
 * shows, and duplication producing a comparable wave. The parts that only mean
 * anything against a real Postgres — the unique index that arbitrates slugs and
 * the `security_invoker` view that scopes the counts — are the point of this
 * file (docs/DECISIONS.md 010).
 */

let owner: TestUser;
let other: TestUser;

beforeAll(async () => {
    owner = await createTestUser("crud-owner");
    other = await createTestUser("crud-other");
});

afterAll(async () => {
    await deleteTestUser(owner);
    await deleteTestUser(other);
});

async function draft(title: string): Promise<SurveyRecord> {
    return createSurvey(owner.db, {
        ownerId: owner.id,
        title,
        elements: [npsQuestion("recommend"), shortTextQuestion("city")]
    });
}

describe("publishing", () => {
    it("derives a readable slug from the title", async () => {
        const survey = await draft("Tööandja maine uuring");
        const published = await publishSurveyDerivingSlug(owner.db, survey);

        expect(published.survey.status).toBe("published");
        expect(published.survey.slug).toBe("tooandja-maine-uuring");
        expect(published.publishedVersion).toBe(published.version);
    });

    it("finds a free slug when the obvious one is taken", async () => {
        const survey = await draft("Tööandja maine uuring");
        const published = await publishSurveyDerivingSlug(owner.db, survey);

        // The unique index arbitrates, not a pre-flight select: the loop offers
        // a new candidate until one lands.
        expect(published.survey.slug).not.toBe("tooandja-maine-uuring");
        expect(published.survey.slug).toMatch(/^tooandja-maine-uuring-/);
        expect(SurveySlugSchema.safeParse(published.survey.slug).success).toBe(
            true
        );
    });

    it("collides across owners too, since the link space is global", async () => {
        const theirs = await createSurvey(other.db, {
            ownerId: other.id,
            title: "Tööandja maine uuring",
            elements: [npsQuestion("recommend")]
        });
        const published = await publishSurveyDerivingSlug(other.db, theirs);

        expect(published.survey.slug).toMatch(/^tooandja-maine-uuring-/);
    });

    it("falls back to a token when the title yields no slug", async () => {
        const survey = await draft("🎉");
        const published = await publishSurveyDerivingSlug(owner.db, survey);
        const { slug } = published.survey;

        expect(slug).not.toBeNull();
        expect(SurveySlugSchema.safeParse(slug).success).toBe(true);
    });

    it("keeps the original link when a closed survey is reopened", async () => {
        const survey = await draft("Töötajate pulss");
        const first = await publishSurveyDerivingSlug(owner.db, survey);
        const slug = first.survey.slug;

        const closed = await closeSurvey(owner.db, survey.survey.id);
        expect(closed.survey.status).toBe("closed");
        expect(closed.survey.slug).toBe(slug);

        // The link is already in people's inboxes; reopening must not rewrite it.
        const reopened = await publishSurveyDerivingSlug(owner.db, closed);
        expect(reopened.survey.slug).toBe(slug);
        expect(reopened.survey.status).toBe("published");
    });

    it("keeps the slug when a renamed survey is republished", async () => {
        const survey = await draft("Enne nime muutmist");
        const published = await publishSurveyDerivingSlug(owner.db, survey);
        const slug = published.survey.slug;

        const renamed = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            published.version,
            { title: "Hoopis teine nimi" }
        );

        expect(renamed.survey.slug).toBe(slug);
    });
});

describe("survey_stats", () => {
    it("counts answerable elements and excludes statements", async () => {
        const survey = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Loendamine",
            elements: [
                statementElement("intro"),
                npsQuestion("recommend"),
                singleChoiceQuestion("role")
            ]
        });

        const stats = await listSurveyStats(owner.db);
        expect(stats.get(survey.survey.id)?.questionCount).toBe(2);
        expect(stats.get(survey.survey.id)?.responseCount).toBe(0);
    });

    it("counts responses, and stops counting a question that is removed", async () => {
        const recommend = npsQuestion("recommend");
        const city = shortTextQuestion("city");
        const survey = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Vastuste loendamine",
            elements: [recommend, city]
        });
        const published = await publishSurveyDerivingSlug(owner.db, survey);

        await submitResponse(owner.db, {
            surveyId: survey.survey.id,
            answers: [
                { questionId: recommend.id, value: { type: "nps", value: 9 } }
            ]
        });

        let stats = await listSurveyStats(owner.db);
        expect(stats.get(survey.survey.id)?.responseCount).toBe(1);
        expect(stats.get(survey.survey.id)?.questionCount).toBe(2);

        // `city` has no answers, so the trigger deletes its projection row
        // outright; `recommend` has one and would be tombstoned instead. Either
        // way the count follows the document, not the history.
        await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            published.version,
            { elements: [recommend] }
        );

        stats = await listSurveyStats(owner.db);
        expect(stats.get(survey.survey.id)?.questionCount).toBe(1);
        expect(stats.get(survey.survey.id)?.responseCount).toBe(1);
    });

    it("shows an owner nothing but their own", async () => {
        const mine = await draft("Minu oma");

        const theirStats = await listSurveyStats(other.db);
        // The view is security_invoker, so the RLS policies on the underlying
        // tables are still the enforcement point.
        expect(theirStats.has(mine.survey.id)).toBe(false);

        const myStats = await listSurveyStats(owner.db);
        expect(myStats.has(mine.survey.id)).toBe(true);
    });
});

describe("duplication as the next wave", () => {
    it("keeps the wave group and the keys, and takes fresh ids and no slug", async () => {
        const role = singleChoiceQuestion("role");
        const recommend = npsQuestion("recommend");
        const source = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Iga-aastane uuring",
            waveLabel: "2025",
            elements: [role, recommend]
        });
        const published = await publishSurveyDerivingSlug(owner.db, source);

        const copy = duplicateSurvey(published.survey, { waveLabel: "2026" });
        const created = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: copy.title,
            locale: copy.locale,
            waveGroupId: copy.waveGroupId,
            waveLabel: copy.waveLabel ?? "",
            elements: copy.elements
        });

        expect(created.survey.waveGroupId).toBe(source.survey.waveGroupId);
        expect(created.survey.id).not.toBe(source.survey.id);
        expect(created.survey.status).toBe("draft");
        // A copy that inherited the slug would take over the source's link.
        expect(created.survey.slug).toBeNull();
        expect(created.survey.waveLabel).toBe("2026");

        // Keys survive so a comparison can join on them; ids do not, because
        // question_id is a primary key across the whole projection table.
        expect(created.survey.elements.map(element => element.key)).toEqual([
            "role",
            "recommend"
        ]);
        expect(created.survey.elements.map(element => element.id)).not.toEqual(
            source.survey.elements.map(element => element.id)
        );
    });
});

describe("deletion", () => {
    it("removes the survey and its responses", async () => {
        const recommend = npsQuestion("recommend");
        const survey = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: "Kustutatav",
            elements: [recommend]
        });
        await publishSurveyDerivingSlug(owner.db, survey);
        await submitResponse(owner.db, {
            surveyId: survey.survey.id,
            answers: [
                { questionId: recommend.id, value: { type: "nps", value: 3 } }
            ]
        });

        await deleteSurvey(owner.db, survey.survey.id);

        expect(await getSurvey(owner.db, survey.survey.id)).toBeNull();
        const stats = await listSurveyStats(owner.db);
        expect(stats.has(survey.survey.id)).toBe(false);
    });

    it("is a no-op on someone else's survey rather than an error", async () => {
        const mine = await draft("Puutumatu");

        // RLS filters the delete to zero rows; PostgREST reports success either
        // way, which is why the action reads the row first and reports notFound.
        await deleteSurvey(other.db, mine.survey.id);

        expect(await getSurvey(owner.db, mine.survey.id)).not.toBeNull();
    });
});

describe("listSurveys", () => {
    it("returns only the caller's surveys, newest first", async () => {
        const mine = await listSurveys(owner.db);
        const theirs = await listSurveys(other.db);

        expect(mine.every(survey => survey.ownerId === owner.id)).toBe(true);
        expect(theirs.every(survey => survey.ownerId === other.id)).toBe(true);

        const updatedAt = mine.map(survey => survey.updatedAt);
        expect(updatedAt).toEqual([...updatedAt].sort().reverse());
    });
});
