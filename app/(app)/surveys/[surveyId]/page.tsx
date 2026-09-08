import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { BuilderScreen } from "@/components/builder/builder-screen";
import { SurveyIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import { keyPolicyFor } from "@/lib/builder/keys";
import { getSurvey, listSurveysInWaveGroup } from "@/lib/db/surveys";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The builder.
 *
 * `requireSessionUser()` is the access check that counts, and RLS is what
 * scopes the read: a survey belonging to someone else simply is not there, so
 * "not yours" and "deleted" are the same 404 — as they must be, or the URL
 * becomes an oracle for which survey ids exist.
 *
 * The wave group is counted here rather than in the client, because it decides
 * whether question keys may still follow their titles: a survey with a sibling
 * wave is already being joined on its keys. See `keyPolicyFor`.
 */
const loadSurvey = cache(async (raw: string) => {
    const id = SurveyIdSchema.safeParse(raw);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return null;

    const db = await createServerDb();
    const record = await getSurvey(db, id.data);
    if (record === null) return null;

    const waves = await listSurveysInWaveGroup(db, record.survey.waveGroupId);
    return { record, waveCount: waves.length };
});

export async function generateMetadata({
    params
}: PageProps<"/surveys/[surveyId]">): Promise<Metadata> {
    const { surveyId } = await params;
    const found = await loadSurvey(surveyId);
    return found === null ? {} : { title: found.record.survey.title };
}

export default async function BuilderPage({
    params
}: PageProps<"/surveys/[surveyId]">) {
    await requireSessionUser();

    const { surveyId } = await params;
    const found = await loadSurvey(surveyId);
    if (found === null) notFound();

    const { record, waveCount } = found;

    return (
        <BuilderScreen
            surveyId={record.survey.id}
            initialSettings={{
                title: record.survey.title,
                description: record.survey.description,
                locale: record.survey.locale,
                waveLabel: record.survey.waveLabel
            }}
            initialElements={record.survey.elements}
            initialVersion={record.version}
            keyPolicy={keyPolicyFor({
                publishedVersion: record.publishedVersion,
                waveCount
            })}
            // A survey that has never been published has collected nothing and
            // emitted nothing, so its results page would be three empty states.
            hasResults={record.survey.slug !== null}
        />
    );
}
