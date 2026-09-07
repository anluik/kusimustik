import { z } from "zod";

import { QuestionIdSchema, SurveyIdSchema } from "@/domain/ids";
import { SURVEY_EVENT_TYPES } from "@/lib/db/events";
import type { NewSurveyEvent } from "@/lib/db/events";

/**
 * The analytics beacon's wire format, shared by the runner and the Route
 * Handler that receives it. See docs/DECISIONS.md 004 and 017.
 *
 * Timestamps are sent as *monotonic offsets*, not wall-clock times. A phone
 * with a wrong clock would otherwise file its events in 2019, where the
 * funnel's date filters silently lose them — and a client timestamp is
 * attacker-controlled input on a public endpoint besides. The server anchors
 * the batch to its own clock and reconstructs the spacing from the offsets,
 * which keeps the ordering within a session without trusting the clock that
 * produced it.
 */

/** One beacon carries a burst of interaction, not a session's worth. */
export const MAX_EVENTS_PER_BATCH = 50;

/**
 * How far back a batch may reach. Generous enough for a survey answered over a
 * long sitting, small enough that a hand-made request cannot back-date events
 * into last month's report.
 */
const MAX_LOOKBACK_MS = 6 * 60 * 60 * 1_000;

export const RunnerEventSchema = z.object({
    type: z.literal(SURVEY_EVENT_TYPES),
    /** Absent for survey-level events (view, start, submit, abandon). */
    questionId: QuestionIdSchema.optional(),
    /** Milliseconds since the runner mounted, from a monotonic clock. */
    offsetMs: z.int().nonnegative(),
    /** Device, referrer, dwell — never anything identifying. */
    meta: z.record(z.string(), z.json()).optional()
});
export type RunnerEvent = z.infer<typeof RunnerEventSchema>;

export const EventBatchSchema = z.object({
    surveyId: SurveyIdSchema,
    /** Anonymous and per-visit; see docs/DECISIONS.md 004. */
    sessionId: z.uuid(),
    /** The same monotonic clock, read as the batch was sent. */
    sentAtOffsetMs: z.int().nonnegative(),
    events: z.array(RunnerEventSchema).min(1).max(MAX_EVENTS_PER_BATCH)
});
export type EventBatch = z.infer<typeof EventBatchSchema>;

/**
 * Anchors a batch to the server's clock: the moment it arrived is when it was
 * sent, and every event sits as far before that as the client said it did.
 * Ages outside the window are clamped rather than rejected — a nonsense offset
 * costs one event's precision, and dropping the batch would cost the lot.
 */
export function stampEvents(
    batch: EventBatch,
    receivedAt: number
): readonly NewSurveyEvent[] {
    return batch.events.map(event => {
        const age = clamp(batch.sentAtOffsetMs - event.offsetMs);
        return {
            surveyId: batch.surveyId,
            sessionId: batch.sessionId,
            questionId: event.questionId ?? null,
            type: event.type,
            at: new Date(receivedAt - age).toISOString(),
            meta: event.meta ?? null
        };
    });
}

function clamp(ageMs: number): number {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
    return Math.min(ageMs, MAX_LOOKBACK_MS);
}
