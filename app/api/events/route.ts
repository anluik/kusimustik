import { insertSurveyEvents } from "@/lib/db/events";
import { EventBatchSchema, stampEvents } from "@/lib/runner/events";
import { createPublicDb } from "@/lib/supabase/public";

/**
 * The analytics beacon (docs/DECISIONS.md 004). A Route Handler rather than a
 * Server Action because `sendBeacon` needs a plain endpoint, and because
 * actions dispatch one at a time per client — a queued beacon would sit behind
 * the submission it is describing.
 *
 * Row-level security is the gate: the insert policy on `survey_events` accepts
 * a write only for a published survey, so this handler does not — and must not
 * — read `surveys` to check. A failure here is swallowed; nothing a respondent
 * did depends on it.
 */

/** A well-behaved batch is a couple of kilobytes. */
const MAX_BODY_BYTES = 32_768;

export async function POST(request: Request): Promise<Response> {
    // Taken before any awaiting, so a slow parse does not shift the whole
    // batch forward in time; see `stampEvents`.
    const receivedAt = Date.now();

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
        return new Response(null, { status: 413 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response(null, { status: 400 });
    }

    const batch = EventBatchSchema.safeParse(body);
    if (!batch.success) return new Response(null, { status: 400 });

    try {
        await insertSurveyEvents(
            createPublicDb(),
            stampEvents(batch.data, receivedAt)
        );
    } catch (error) {
        // Best-effort by design: a draft survey, a closed one, or a database
        // that is simply busy. The respondent is not told and is not blocked.
        console.error("survey_events beacon dropped", error);
    }

    return new Response(null, { status: 204 });
}
