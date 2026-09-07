import { z } from "zod";

import { QuestionIdSchema } from "@/domain/ids";
import type { QuestionId, SurveyId } from "@/domain/ids";
import { unwrap } from "@/lib/db/errors";
import { parseRow, parseRows } from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * The drop-off funnel's raw material. Two grouped queries against
 * `survey_events`, both `security invoker`, so RLS decides what an owner sees.
 *
 * Neither returns a question's key, title or position: those are definition
 * data and come from `surveys.elements` through `SurveySchema`. The projection
 * table is an index, not a source of truth (docs/DECISIONS.md 002), and the
 * funnel would be the easy place to forget that — a report ordered by
 * `survey_questions.position` would silently disagree with the document the
 * owner is looking at. `lib/results/funnel.ts` does the join, in document
 * order.
 */

export const FunnelTotalsSchema = z.object({
    /** Distinct visits that loaded the runner. */
    views: z.int().nonnegative(),
    /** Of those, the ones that touched any control. */
    starts: z.int().nonnegative(),
    submits: z.int().nonnegative(),
    /** Started, left, and never came back to submit. */
    abandons: z.int().nonnegative()
});
export type FunnelTotals = z.infer<typeof FunnelTotalsSchema>;

export const QuestionFunnelRowSchema = z.object({
    questionId: QuestionIdSchema,
    /** Distinct sessions that scrolled the question into view. */
    reached: z.int().nonnegative(),
    /** Of those, the ones that left it holding an acceptable answer. */
    answered: z.int().nonnegative(),
    /**
     * Median milliseconds between reaching the question and answering it.
     * Null when nobody answered, or when no answer carried a dwell time — an
     * older client, or storage the browser refused.
     */
    medianDwellMs: z.int().nonnegative().nullable()
});
export type QuestionFunnelRow = z.infer<typeof QuestionFunnelRowSchema>;

/** Empty rather than absent: a survey nobody has opened has all-zero stages. */
const NO_EVENTS: FunnelTotals = {
    views: 0,
    starts: 0,
    submits: 0,
    abandons: 0
};

export async function getFunnelTotals(
    db: Db,
    surveyId: SurveyId
): Promise<FunnelTotals> {
    const row = unwrap(
        `getFunnelTotals(${surveyId})`,
        await db
            .rpc("survey_funnel_totals", { p_survey_id: surveyId })
            .maybeSingle()
    );
    if (row === null) return NO_EVENTS;

    return parseRow(
        FunnelTotalsSchema,
        {
            views: row.views,
            starts: row.starts,
            submits: row.submits,
            abandons: row.abandons
        },
        `funnel totals of ${surveyId}`
    );
}

/**
 * One row per question the runner has recorded any interaction with — which is
 * not the same set as the survey's current questions. A question added since
 * the last visit has no row, and a question since removed still has one; the
 * caller joins against the document and lets it decide what exists.
 */
export async function listQuestionFunnel(
    db: Db,
    surveyId: SurveyId
): Promise<Map<QuestionId, QuestionFunnelRow>> {
    const rows = unwrap(
        `listQuestionFunnel(${surveyId})`,
        await db.rpc("survey_question_funnel", { p_survey_id: surveyId })
    );

    const parsed = parseRows(
        QuestionFunnelRowSchema,
        rows.map(row => ({
            questionId: row.question_id,
            reached: row.reached,
            answered: row.answered,
            // Postgres `round(numeric)` of a null median stays null; the
            // generated type cannot express that the column is nullable.
            medianDwellMs: row.median_dwell_ms ?? null
        })),
        `question funnel of ${surveyId}`
    );

    return new Map(parsed.map(row => [row.questionId, row]));
}
