import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localizedText } from "@/domain/content";

import { authorElement } from "@/domain/localize";
import type { SurveyElement } from "@/domain/question";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    opinionScaleQuestion,
    shortTextQuestion,
    singleChoiceQuestion,
    statementElement,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { DbUniqueViolationError } from "@/lib/db/errors";
import { listResponses, submitResponse } from "@/lib/db/responses";
import {
    createSurvey,
    getSurvey,
    listSurveyQuestions,
    publishSurvey,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";

/**
 * The derived projection (docs/DECISIONS.md 002). It is rebuilt by a trigger on
 * every change to `elements`, and the interesting half is removal: a question
 * nobody answered disappears, a question with answers is tombstoned so the
 * collected responses keep something to point at.
 */

const intro = statementElement("intro");
const role = singleChoiceQuestion("role");
const recommend = npsQuestion("recommend");
const city = shortTextQuestion("city");
const satisfaction = opinionScaleQuestion("satisfaction");

let owner: TestUser;
let survey: SurveyRecord;

async function setElements(elements: readonly SurveyElement[]): Promise<void> {
    survey = await updateSurveyDefinition(
        owner.db,
        survey.survey.id,
        survey.version,
        {
            elements: stored(elements)
        }
    );
}

beforeAll(async () => {
    owner = await createTestUser("projection");
    survey = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: localizedText("et", "Projection"),
        elements: stored([intro, role, recommend, city])
    });
});

afterAll(async () => {
    await deleteTestUser(owner);
});

describe("survey_questions follows the elements column", () => {
    it("projects the answerable elements in document order", async () => {
        const questions = await listSurveyQuestions(owner.db, survey.survey.id);

        expect(questions.map(question => question.key)).toEqual([
            "role",
            "recommend",
            "city"
        ]);
        // Position is the index within `elements`, so the statement at 0 leaves
        // a gap rather than shifting the questions.
        expect(questions.map(question => question.position)).toEqual([1, 2, 3]);
        expect(questions.map(question => question.type)).toEqual([
            "single_choice",
            "nps",
            "short_text"
        ]);
        expect(questions.every(question => question.removedAt === null)).toBe(
            true
        );
    });

    it("follows a reorder, a rename and an insertion", async () => {
        const renamed: SurveyElement = {
            ...role,
            key: "respondent_role",
            title: "Which role fits you best?"
        };
        await setElements([recommend, intro, renamed, city, satisfaction]);

        const questions = await listSurveyQuestions(owner.db, survey.survey.id);
        expect(
            questions.map(question => [question.key, question.position])
        ).toEqual([
            ["recommend", 0],
            ["respondent_role", 2],
            ["city", 3],
            ["satisfaction", 4]
        ]);
        expect(questions[1]?.questionId).toBe(role.id);
        expect(questions[1]?.title).toBe("Which role fits you best?");
    });

    it("deletes a question nobody has answered", async () => {
        await setElements([recommend, intro, role, satisfaction]);

        const live = await listSurveyQuestions(owner.db, survey.survey.id);
        expect(live.map(question => question.key)).toEqual([
            "recommend",
            "role",
            "satisfaction"
        ]);

        // Gone outright, not tombstoned: there was nothing to preserve.
        const all = await listSurveyQuestions(owner.db, survey.survey.id, {
            includeRemoved: true
        });
        expect(all.map(question => question.key)).not.toContain("city");
    });

    it("tombstones an answered question instead, and keeps its answers", async () => {
        const slug = testSlug("projection");
        survey = await publishSurvey(owner.db, survey.survey.id, slug);

        await submitResponse(anonClient(), {
            surveyId: survey.survey.id,
            answers: [
                { questionId: recommend.id, value: { type: "nps", value: 10 } },
                {
                    questionId: satisfaction.id,
                    value: { type: "opinion_scale", value: 4 }
                }
            ]
        });

        await setElements([intro, role, satisfaction]);

        const live = await listSurveyQuestions(owner.db, survey.survey.id);
        expect(live.map(question => question.key)).toEqual([
            "role",
            "satisfaction"
        ]);

        const all = await listSurveyQuestions(owner.db, survey.survey.id, {
            includeRemoved: true
        });
        const tombstone = all.find(
            question => question.questionId === recommend.id
        );
        expect(tombstone?.removedAt).not.toBeNull();

        const responses = await listResponses(owner.db, survey.survey.id);
        expect(responses).toHaveLength(1);
        expect(responses[0]?.answers[recommend.id]).toEqual({
            type: "nps",
            value: 10
        });
    });

    it("refuses a new answer to a tombstoned question", async () => {
        await expect(
            submitResponse(anonClient(), {
                surveyId: survey.survey.id,
                answers: [
                    {
                        questionId: recommend.id,
                        value: { type: "nps", value: 1 }
                    }
                ]
            })
        ).rejects.toThrow();
    });

    it("empties the projection when the last element goes", async () => {
        await setElements([]);

        await expect(
            listSurveyQuestions(owner.db, survey.survey.id)
        ).resolves.toEqual([]);

        const all = await listSurveyQuestions(owner.db, survey.survey.id, {
            includeRemoved: true
        });
        expect(all.map(question => question.key).sort()).toEqual([
            "recommend",
            "satisfaction"
        ]);
        expect(all.every(question => question.removedAt !== null)).toBe(true);
    });

    it("hands a key from one question to another in a single write", async () => {
        // The builder reaches this in one gesture: delete a question and add
        // another inside the 700ms autosave debounce, and both carry the
        // default title, so both derive the same key. The trigger used to
        // insert the arrival before removing the departure and trip its own
        // unique index, wedging the builder in a save-failed state no retry
        // could clear. See the 20260908120000 migration.
        const fresh = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Key handover"),
            elements: stored([shortTextQuestion("linn")])
        });
        const replacement = shortTextQuestion("linn");

        const saved = await updateSurveyDefinition(
            owner.db,
            fresh.survey.id,
            fresh.version,
            { elements: stored([replacement]) }
        );

        const questions = await listSurveyQuestions(owner.db, saved.survey.id, {
            includeRemoved: true
        });
        expect(questions).toHaveLength(1);
        expect(questions[0]?.questionId).toBe(replacement.id);
        expect(questions[0]?.key).toBe("linn");
    });

    it("will not hand a key away from a question that kept its answers", async () => {
        // The other half of the same invariant: a tombstone holds its key for
        // the life of the survey, because the answers filed under it are still
        // exported and still compared. The builder is told which keys those
        // are (`listReservedQuestionKeys`) and mints `linn_2` instead; this is
        // the backstop for a client that does not.
        const fresh = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Reserved key"),
            elements: stored([npsQuestion("recommend")])
        });
        const answered = fresh.survey.elements[0];
        if (answered === undefined) throw new Error("no question");

        const published = await publishSurvey(
            owner.db,
            fresh.survey.id,
            testSlug("reserved")
        );
        await submitResponse(anonClient(), {
            surveyId: published.survey.id,
            answers: [
                { questionId: answered.id, value: { type: "nps", value: 7 } }
            ]
        });

        const usurper = npsQuestion("recommend");
        await expect(
            updateSurveyDefinition(
                owner.db,
                published.survey.id,
                published.version,
                { elements: stored([usurper]) }
            )
        ).rejects.toBeInstanceOf(DbUniqueViolationError);
    });

    it("projects the title in the survey's own language", async () => {
        // The projection carries one string and the trigger resolves it, so
        // this is the SQL half of `resolveText` — it has to agree with the
        // TypeScript half or an owner's question list and their builder would
        // disagree about what a question is called (DECISIONS 030).
        const question = npsQuestion("recommend");
        const fresh = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Translated"),
            locale: "et",
            elements: [
                {
                    ...authorElement(question, "et"),
                    title: { et: "Kas soovitaksite?", en: "Would you?" }
                }
            ]
        });

        await expect(
            listSurveyQuestions(owner.db, fresh.survey.id)
        ).resolves.toMatchObject([{ title: "Kas soovitaksite?" }]);

        // Changing the language changes which title the projection holds, so
        // the trigger fires on the locale as well as on the document.
        const switched = await updateSurveyDefinition(
            owner.db,
            fresh.survey.id,
            fresh.version,
            { locale: "en" }
        );
        await expect(
            listSurveyQuestions(owner.db, switched.survey.id)
        ).resolves.toMatchObject([{ title: "Would you?" }]);
    });

    it("falls back when the survey's own language is the one that is missing", async () => {
        const fresh = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Untranslated"),
            locale: "ru",
            elements: [
                {
                    ...authorElement(npsQuestion("recommend"), "et"),
                    title: { et: "Kas soovitaksite?" }
                }
            ]
        });

        await expect(
            listSurveyQuestions(owner.db, fresh.survey.id)
        ).resolves.toMatchObject([{ title: "Kas soovitaksite?" }]);
    });

    it("cascades away with the survey", async () => {
        const id = survey.survey.id;
        const doomed = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Doomed"),
            elements: stored([npsQuestion("recommend")])
        });
        await owner.db.from("surveys").delete().eq("id", doomed.survey.id);

        await expect(getSurvey(owner.db, doomed.survey.id)).resolves.toBeNull();
        await expect(
            listSurveyQuestions(owner.db, doomed.survey.id, {
                includeRemoved: true
            })
        ).resolves.toEqual([]);
        // The survey under test is untouched.
        await expect(getSurvey(owner.db, id)).resolves.not.toBeNull();
    });
});
