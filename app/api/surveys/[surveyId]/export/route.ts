import { getTranslations } from "next-intl/server";

import { SurveyIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import { listResponses } from "@/lib/db/responses";
import { getSurvey } from "@/lib/db/surveys";
import { buildCsvFile, csvFileName } from "@/lib/results/csv";
import type { CsvMetaLabels } from "@/lib/results/csv";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The CSV download (docs/PLAN.md Phase 8).
 *
 * A Route Handler rather than a Server Action because the browser has to be
 * able to *navigate* to it: an action returns a value to JavaScript, and a
 * download wants a response with a `Content-Disposition`. It sits under
 * `/api/surveys/`, which `PUBLIC_PREFIXES` does not list, so the proxy already
 * turns anonymous requests away — but that is an optimistic filter, so this
 * handler re-checks the session itself and lets RLS scope the reads. "Not
 * yours" and "deleted" are therefore the same 404, as they must be, or the URL
 * becomes an oracle for which survey ids exist.
 *
 * The whole file is built in memory. That is the same trade the results page
 * makes (DECISIONS 018): the export has to agree with `aggregate()` about what
 * was answered, so it walks the same responses. Streaming enters when a survey
 * has enough responses for that to hurt.
 */
export async function GET(
    _request: Request,
    context: RouteContext<"/api/surveys/[surveyId]/export">
): Promise<Response> {
    await requireSessionUser();

    const { surveyId } = await context.params;
    const id = SurveyIdSchema.safeParse(surveyId);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return new Response(null, { status: 404 });

    const db = await createServerDb();
    const record = await getSurvey(db, id.data);
    if (record === null) return new Response(null, { status: 404 });

    const [responses, t] = await Promise.all([
        listResponses(db, id.data),
        getTranslations("Results.export.columns")
    ]);

    // Written out rather than mapped over `CSV_META_COLUMNS`: the literal is
    // what makes a missing message key a type error here instead of a column
    // headed with its own path.
    const labels: CsvMetaLabels = {
        responseId: t("responseId"),
        submittedAt: t("submittedAt"),
        locale: t("locale"),
        surveyVersion: t("surveyVersion")
    };

    const file = buildCsvFile(record.survey.elements, responses, labels);
    const name = csvFileName(record.survey.title, new Date());

    return new Response(file, {
        headers: {
            "content-type": "text/csv; charset=utf-8",
            // `csvFileName` slugifies, so the name is plain ASCII and needs no
            // RFC 5987 encoding.
            "content-disposition": `attachment; filename="${name}"`,
            // The owner's own data, and a stale copy is worse than another
            // round trip.
            "cache-control": "no-store"
        }
    });
}
