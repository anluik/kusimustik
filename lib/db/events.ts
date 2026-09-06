import { z } from "zod";

import { QuestionIdSchema, SurveyIdSchema } from "@/domain/ids";
import type { SurveyId } from "@/domain/ids";
import { unwrap } from "@/lib/db/errors";
import { JsonObjectSchema, TimestampSchema, parseRows } from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * Interaction analytics; see docs/DECISIONS.md 004. Append-only, high volume,
 * and structurally unjoinable to an individual's answers — `session_id` lives
 * here and nowhere else.
 *
 * Writes are best-effort. The caller (a Route Handler, never a Server Action)
 * catches and drops anything thrown here: a failed event must never surface to
 * a respondent or abort a submission.
 */

export const SURVEY_EVENT_TYPES = [
    "view",
    "start",
    "question_view",
    "question_answer",
    "submit",
    "abandon"
] as const;

export type SurveyEventType = (typeof SURVEY_EVENT_TYPES)[number];

export const NewSurveyEventSchema = z.object({
    surveyId: SurveyIdSchema,
    /** Anonymous and per-visit. Never a user id. */
    sessionId: z.uuid(),
    /** Null for survey-level events. */
    questionId: QuestionIdSchema.nullable().default(null),
    type: z.literal(SURVEY_EVENT_TYPES),
    /** Client timestamp; omitted means "now", stamped by the database. */
    at: TimestampSchema.optional(),
    meta: JsonObjectSchema.nullable().default(null)
});
export type NewSurveyEvent = z.input<typeof NewSurveyEventSchema>;

export const SurveyEventSchema = z.object({
    id: z.int(),
    surveyId: SurveyIdSchema,
    sessionId: z.uuid(),
    questionId: QuestionIdSchema.nullable(),
    type: z.literal(SURVEY_EVENT_TYPES),
    at: TimestampSchema,
    meta: JsonObjectSchema.nullable()
});
export type SurveyEvent = z.infer<typeof SurveyEventSchema>;

/** Batched: one round trip per beacon, not one per event. */
export async function insertSurveyEvents(
    db: Db,
    events: readonly NewSurveyEvent[]
): Promise<void> {
    if (events.length === 0) return;

    const rows = events.map(event => {
        const parsed = NewSurveyEventSchema.parse(event);
        return {
            survey_id: parsed.surveyId,
            session_id: parsed.sessionId,
            question_id: parsed.questionId,
            type: parsed.type,
            ...(parsed.at !== undefined && { at: parsed.at }),
            meta: parsed.meta
        };
    });

    unwrap(
        `insertSurveyEvents(${rows.length})`,
        await db.from("survey_events").insert(rows)
    );
}

/** Owner-facing: the raw material for the Phase 7 drop-off funnel. */
export async function listSurveyEvents(
    db: Db,
    surveyId: SurveyId,
    options: { readonly since?: string; readonly limit?: number } = {}
): Promise<SurveyEvent[]> {
    let query = db
        .from("survey_events")
        .select("id, survey_id, session_id, question_id, type, at, meta")
        .eq("survey_id", surveyId);

    if (options.since !== undefined) query = query.gte("at", options.since);

    const rows = unwrap(
        `listSurveyEvents(${surveyId})`,
        await query
            .order("at", { ascending: true })
            .limit(options.limit ?? 1_000)
    );

    return parseRows(
        SurveyEventSchema,
        rows.map(row => ({
            id: row.id,
            surveyId: row.survey_id,
            sessionId: row.session_id,
            questionId: row.question_id,
            type: row.type,
            at: row.at,
            meta: row.meta
        })),
        `survey_events of ${surveyId}`
    );
}
