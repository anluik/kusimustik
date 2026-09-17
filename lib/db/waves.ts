import { z } from "zod";

import type { QuestionId, SurveyId, WaveGroupId } from "@/domain/ids";
import { QuestionIdSchema, SurveyIdSchema } from "@/domain/ids";
import { resolveElement, resolveSurvey } from "@/domain/localize";
import type { AnswerableQuestion } from "@/domain/question";
import { AuthoredElementSchema, isAnswerableElement } from "@/domain/question";
import { LOCALES } from "@/domain/survey";
import type { Survey } from "@/domain/survey";
import { unwrap } from "@/lib/db/errors";
import { parseRows } from "@/lib/db/parse";
import { listResponsesBySurvey } from "@/lib/db/responses";
import type { ResponseRecord } from "@/lib/db/responses";
import { listWaveGroupSurveys } from "@/lib/db/surveys";
import type { Db } from "@/lib/db/types";

/**
 * The reads behind wave comparison: a recurring survey's waves, the responses
 * of the ones a comparison covers, and the last definition of a question that
 * has since been removed.
 *
 * Which question in one wave is which in another is not decided here, or
 * anywhere by inference: it is the owner's saved comparison
 * (docs/DECISIONS.md 035), and `buildComparison` in `lib/results/` lines the
 * waves up against it.
 */

export type WaveDefinition = {
    /**
     * Resolved through the wave's own language: comparison is an owner-facing
     * report, and a group whose 2027 wave was written in English still lines up.
     */
    readonly survey: Survey;
    /** When the wave was created — what waves are ordered by. */
    readonly createdAt: string;
};

export type WaveResponses = WaveDefinition & {
    readonly responses: readonly ResponseRecord[];
};

/**
 * Every wave of a recurring survey, oldest first. Empty when the group does not
 * exist or is not the caller's — the same answer, deliberately.
 */
export async function listWaveGroup(
    db: Db,
    waveGroupId: WaveGroupId
): Promise<WaveDefinition[]> {
    const records = await listWaveGroupSurveys(db, waveGroupId);
    return records.map(record => ({
        survey: resolveSurvey(record.survey),
        createdAt: record.createdAt
    }));
}

/**
 * The given waves with their responses attached, in the order given. Two paged
 * reads however many waves there are (`listResponsesBySurvey`).
 */
export async function withResponses(
    db: Db,
    waves: readonly WaveDefinition[]
): Promise<WaveResponses[]> {
    const responses = await listResponsesBySurvey(
        db,
        waves.map(wave => wave.survey.id)
    );
    return waves.map(wave => ({
        ...wave,
        responses: responses.get(wave.survey.id) ?? []
    }));
}

export type RemovedQuestion = {
    readonly surveyId: SurveyId;
    readonly question: AnswerableQuestion;
};

const RemovedRowSchema = z.object({
    question_id: QuestionIdSchema,
    survey_id: SurveyIdSchema,
    locale: z.literal(LOCALES),
    element: AuthoredElementSchema
});

/**
 * The definition each of these questions last had, for the ones that have been
 * removed from their survey but kept their answers (a tombstone, DECISIONS
 * 008). A question that is live, or was never answered, is not in the result.
 *
 * The newest published snapshot holding the question is what its answers were
 * collected against, so it is what they are summarised against — resolved in
 * the language that snapshot was written in.
 */
export async function listRemovedQuestions(
    db: Db,
    questionIds: readonly QuestionId[]
): Promise<ReadonlyMap<QuestionId, RemovedQuestion>> {
    if (questionIds.length === 0) return new Map();

    const what = `listRemovedQuestions(${questionIds.length})`;
    const rows = parseRows(
        RemovedRowSchema,
        unwrap(
            what,
            await db.rpc("removed_question_definitions", {
                p_question_ids: [...questionIds]
            })
        ),
        what
    );

    const removed = new Map<QuestionId, RemovedQuestion>();
    for (const row of rows) {
        const element = resolveElement(row.element, row.locale);
        if (!isAnswerableElement(element)) continue;
        removed.set(row.question_id, {
            surveyId: row.survey_id,
            question: element
        });
    }
    return removed;
}
