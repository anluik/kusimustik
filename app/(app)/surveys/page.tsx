import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SurveysScreen } from "@/components/surveys/surveys-screen";
import { requireSessionUser } from "@/lib/auth/session";
import { listSurveyStats, listSurveys } from "@/lib/db/surveys";
import { createServerDb } from "@/lib/supabase/server";
import { toListItems } from "@/lib/surveys/list";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Surveys");
    return { title: t("title") };
}

/**
 * The survey list.
 *
 * `requireSessionUser()` is the access check that counts — the proxy already
 * turned anonymous requests away, but a proxy is an optimistic filter. What
 * scopes the query itself is RLS: the request-scoped client carries the
 * owner's identity, so `listSurveys` needs no `where owner_id = …` and could
 * not be made to leak by forgetting one.
 *
 * The summaries and their counts are two queries rather than an embed, joined
 * in memory — the counts come from a view and the shape of the join is then
 * something the type checker can see. Grouping, filtering and sorting happen
 * in the client component, which is why the whole list is fetched at once.
 */
export default async function SurveysPage() {
    await requireSessionUser();
    const db = await createServerDb();

    const [summaries, stats] = await Promise.all([
        listSurveys(db),
        listSurveyStats(db)
    ]);

    return (
        <SurveysScreen
            items={toListItems(summaries, stats)}
            // Read once here so the server render and the hydrated one cannot
            // disagree about which day "today" is.
            nowIso={new Date().toISOString()}
        />
    );
}
