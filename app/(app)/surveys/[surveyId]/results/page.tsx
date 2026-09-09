import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { ResultsScreen } from "@/components/results/results-screen";
import { SurveyIdSchema } from "@/domain/ids";
import { resolveElements } from "@/domain/localize";
import { requireSessionUser } from "@/lib/auth/session";
import { getFunnelTotals, listQuestionFunnel } from "@/lib/db/funnel";
import { listResponses } from "@/lib/db/responses";
import { getSurvey } from "@/lib/db/surveys";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The results page.
 *
 * `requireSessionUser()` is the access check that counts; RLS is what scopes
 * every read below, so "not yours" and "deleted" are the same 404 — as they
 * must be, or the URL becomes an oracle for which survey ids exist. The funnel
 * functions are `security invoker` for the same reason: nothing here relies on
 * the page having checked.
 *
 * Four reads, one round trip each, issued together. The responses are fetched
 * whole rather than aggregated in SQL because `aggregate()` is the domain's
 * definition of what a summary means and there must be exactly one of those —
 * a second implementation in Postgres would be a second answer to "what is the
 * mean of this scale" with nothing comparing them. Paging enters when a survey
 * has enough responses for that to hurt; it does not yet.
 */
const loadResults = cache(async (raw: string) => {
    const id = SurveyIdSchema.safeParse(raw);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return null;

    const db = await createServerDb();
    const record = await getSurvey(db, id.data);
    if (record === null) return null;

    const [responses, totals, questionFunnel] = await Promise.all([
        listResponses(db, id.data),
        getFunnelTotals(db, id.data),
        listQuestionFunnel(db, id.data)
    ]);

    return { record, responses, totals, questionFunnel };
});

export async function generateMetadata({
    params
}: PageProps<"/surveys/[surveyId]/results">): Promise<Metadata> {
    const { surveyId } = await params;
    const found = await loadResults(surveyId);
    if (found === null) return {};

    const t = await getTranslations("Results");
    return { title: `${found.record.survey.title} · ${t("title")}` };
}

export default async function ResultsPage({
    params
}: PageProps<"/surveys/[surveyId]/results">) {
    await requireSessionUser();

    const { surveyId } = await params;
    const found = await loadResults(surveyId);
    if (found === null) notFound();

    const { record, responses, totals, questionFunnel } = found;

    return (
        <ResultsScreen
            surveyId={record.survey.id}
            title={record.survey.title}
            status={record.survey.status}
            elements={resolveElements(
                record.survey.elements,
                record.survey.locale
            )}
            responses={responses}
            totals={totals}
            // Handed over as an array rather than the repository's Map: a Map
            // cannot cross the server/client boundary, and rebuilding it in the
            // client component keeps the serialisation boundary explicit.
            questionFunnel={[...questionFunnel.values()]}
        />
    );
}
