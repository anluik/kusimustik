import { z } from "zod";

import type { AnswerValue } from "@/domain/answer";
import { AnswerValueSchema } from "@/domain/answer";
import type { QuestionId, ResponseId, SurveyId } from "@/domain/ids";
import {
    QuestionIdSchema,
    ResponseIdSchema,
    SurveyIdSchema
} from "@/domain/ids";
import { LOCALES } from "@/domain/survey";
import { DbError, unwrap } from "@/lib/db/errors";
import {
    JsonObjectSchema,
    TimestampSchema,
    parseRow,
    parseRows
} from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * Responses and answers. One `responses` row per submission, one `answers` row
 * per question *answered* — a skipped question has no row at all, which is what
 * makes `answeredCount` and `skippedCount` computable (docs/DECISIONS.md 007).
 */

export const SubmittedAnswerSchema = z.object({
    questionId: QuestionIdSchema,
    value: AnswerValueSchema
});
export type SubmittedAnswer = z.infer<typeof SubmittedAnswerSchema>;

export const NewResponseSchema = z.object({
    surveyId: SurveyIdSchema,
    answers: z.array(SubmittedAnswerSchema),
    locale: z.literal(LOCALES).optional(),
    /** Device, referrer, collector — never anything identifying. */
    meta: JsonObjectSchema.optional()
});
export type NewResponse = z.infer<typeof NewResponseSchema>;

export const ResponseRecordSchema = z.object({
    id: ResponseIdSchema,
    surveyId: SurveyIdSchema,
    /** The definition snapshot this respondent actually saw. */
    surveyVersion: z.int().positive(),
    locale: z.literal(LOCALES).nullable(),
    submittedAt: TimestampSchema,
    /** Keyed by question id; a missing key is a skipped question. */
    answers: z.record(QuestionIdSchema, AnswerValueSchema)
});
export type ResponseRecord = z.infer<typeof ResponseRecordSchema>;

/**
 * Submits one response and its answers as a single statement — half a
 * submission is worthless, and two round trips cannot be made atomic from the
 * client. Row-level security is still the gate: the insert fails unless the
 * survey is published.
 *
 * This validates the *envelope* only. Validating an answer against its question
 * is `buildAnswerSchema`'s job and belongs in the Server Action, server-side,
 * before this is called.
 */
export async function submitResponse(
    db: Db,
    input: NewResponse
): Promise<ResponseId> {
    const parsed = NewResponseSchema.parse(input);

    const id = unwrap(
        `submitResponse(${parsed.surveyId})`,
        await db.rpc("submit_response", {
            p_survey_id: parsed.surveyId,
            p_answers: parsed.answers.map(answer => ({
                question_id: answer.questionId,
                value: answer.value
            })),
            ...(parsed.locale !== undefined && { p_locale: parsed.locale }),
            ...(parsed.meta !== undefined && { p_meta: parsed.meta })
        })
    );

    return ResponseIdSchema.parse(id);
}

export async function countResponses(
    db: Db,
    surveyId: SurveyId
): Promise<number> {
    const { count, error } = await db
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("survey_id", surveyId);

    if (error !== null) {
        throw new DbError(
            `countResponses(${surveyId}): ${error.message} (${error.code})`,
            { cause: error }
        );
    }
    return count ?? 0;
}

/**
 * Every response to a survey with its answers attached, oldest first.
 *
 * Deliberately two queries joined in memory rather than a PostgREST embed: the
 * answers are needed keyed by question id anyway, and the shape of the join is
 * then something the type checker can see.
 */
export async function listResponses(
    db: Db,
    surveyId: SurveyId
): Promise<ResponseRecord[]> {
    const bySurvey = await listResponsesBySurvey(db, [surveyId]);
    return bySurvey.get(surveyId) ?? [];
}

/**
 * The same, for several surveys at once, keyed by survey id.
 *
 * Two round trips whatever the number of surveys, which is what keeps wave
 * comparison from issuing a query per wave — a wave group is small, but the
 * per-wave version is a loop that grows with the customer's history. Every
 * requested survey gets an entry, empty where it has no responses, so a caller
 * never has to tell "no responses" from "not asked for".
 */
export async function listResponsesBySurvey(
    db: Db,
    surveyIds: readonly SurveyId[]
): Promise<ReadonlyMap<SurveyId, ResponseRecord[]>> {
    const bySurvey = new Map<SurveyId, ResponseRecord[]>(
        surveyIds.map(id => [id, []])
    );
    // `.in()` with an empty list is a query that cannot match, not an error —
    // but it is still a round trip, and the answer is already known.
    if (surveyIds.length === 0) return bySurvey;

    const ids = [...surveyIds];
    const what = `listResponsesBySurvey(${ids.length} surveys)`;

    const responseRows = unwrap(
        what,
        await db
            .from("responses")
            .select("id, survey_id, survey_version, locale, submitted_at")
            .in("survey_id", ids)
            .order("submitted_at", { ascending: true })
    );

    const answerRows = unwrap(
        `${what} answers`,
        await db
            .from("answers")
            .select("response_id, question_id, value")
            .in("survey_id", ids)
    );

    const byResponse = new Map<string, Record<string, unknown>>();
    for (const row of answerRows) {
        const answers = byResponse.get(row.response_id) ?? {};
        answers[row.question_id] = row.value;
        byResponse.set(row.response_id, answers);
    }

    const records = parseRows(
        ResponseRecordSchema,
        responseRows.map(row => ({
            id: row.id,
            surveyId: row.survey_id,
            surveyVersion: row.survey_version,
            locale: row.locale,
            submittedAt: row.submitted_at,
            answers: byResponse.get(row.id) ?? {}
        })),
        what
    );

    for (const record of records) {
        // A response whose survey was not asked for cannot come back: RLS and
        // the `in` filter agree on the set. The fallback keeps the map total
        // rather than trusting that.
        const existing = bySurvey.get(record.surveyId) ?? [];
        existing.push(record);
        bySurvey.set(record.surveyId, existing);
    }

    return bySurvey;
}

export async function getResponse(
    db: Db,
    responseId: ResponseId
): Promise<ResponseRecord | null> {
    const row = unwrap(
        `getResponse(${responseId})`,
        await db
            .from("responses")
            .select("id, survey_id, survey_version, locale, submitted_at")
            .eq("id", responseId)
            .maybeSingle()
    );
    if (row === null) return null;

    const answerRows = unwrap(
        `getResponse(${responseId}) answers`,
        await db
            .from("answers")
            .select("question_id, value")
            .eq("response_id", responseId)
    );

    return parseRow(
        ResponseRecordSchema,
        {
            id: row.id,
            surveyId: row.survey_id,
            surveyVersion: row.survey_version,
            locale: row.locale,
            submittedAt: row.submitted_at,
            answers: Object.fromEntries(
                answerRows.map(answer => [answer.question_id, answer.value])
            )
        },
        `response ${responseId}`
    );
}

/**
 * The input `aggregate()` expects: one entry per response considered, `null`
 * where that respondent skipped the question. Keep the response list as the
 * denominator — dropping the skips here would silently inflate every
 * percentage.
 */
export function answersForQuestion(
    responses: readonly ResponseRecord[],
    questionId: QuestionId
): (AnswerValue | null)[] {
    return responses.map(response => response.answers[questionId] ?? null);
}
