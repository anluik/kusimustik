import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localizedText } from "@/domain/content";
import { listResponses } from "@/lib/db/responses";
import { createSurvey, publishSurvey } from "@/lib/db/surveys";
import {
    createTestUser,
    deleteTestUser,
    npsQuestion,
    serviceClient,
    shortTextQuestion,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";

/**
 * Reading every response, however many there are.
 *
 * PostgREST stops at `max_rows` and says nothing, so this is proved against a
 * survey with more responses *and* more answers than one request returns —
 * the reads used to hand back an arbitrary thousand (docs/DECISIONS.md 035).
 */

const RESPONSES = 1_050;

let owner: TestUser;

beforeAll(async () => {
    owner = await createTestUser("paging");
});

afterAll(async () => {
    await deleteTestUser(owner);
});

describe("listResponses", () => {
    it("reads past PostgREST's row cap, every response with every answer", async () => {
        const score = npsQuestion("score");
        const comment = shortTextQuestion("comment");
        const created = await createSurvey(owner.db, {
            ownerId: owner.id,
            title: localizedText("et", "Paging"),
            elements: stored([score, comment])
        });
        const surveyId = created.survey.id;
        await publishSurvey(owner.db, surveyId, testSlug("paging"));

        // Seeded directly: a thousand round trips through `submit_response`
        // would prove nothing more and take a minute.
        const service = serviceClient();
        const ids = Array.from({ length: RESPONSES }, () =>
            crypto.randomUUID()
        );
        const responses = await service
            .from("responses")
            .insert(
                ids.map(id => ({ id, survey_id: surveyId, survey_version: 1 }))
            );
        expect(responses.error).toBeNull();

        const answers = await service.from("answers").insert(
            ids.flatMap((id, index) => [
                {
                    response_id: id,
                    survey_id: surveyId,
                    question_id: score.id,
                    value: { type: "nps", value: index % 11 }
                },
                {
                    response_id: id,
                    survey_id: surveyId,
                    question_id: comment.id,
                    value: { type: "short_text", value: `answer ${index}` }
                }
            ])
        );
        expect(answers.error).toBeNull();

        const read = await listResponses(owner.db, surveyId);

        expect(read).toHaveLength(RESPONSES);
        expect(new Set(read.map(response => response.id)).size).toBe(RESPONSES);
        for (const response of read) {
            expect(Object.keys(response.answers).sort()).toEqual(
                [score.id, comment.id].sort()
            );
        }
    });
});
