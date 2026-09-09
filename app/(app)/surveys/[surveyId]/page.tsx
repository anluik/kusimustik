import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { BuilderScreen } from "@/components/builder/builder-screen";
import { SurveyIdSchema } from "@/domain/ids";
import { resolveElements } from "@/domain/localize";
import { requireSessionUser } from "@/lib/auth/session";
import { keyPolicyFor } from "@/lib/builder/keys";
import { countResponses } from "@/lib/db/responses";
import {
    getSurvey,
    listReservedQuestionKeys,
    listSurveysInWaveGroup
} from "@/lib/db/surveys";
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
 *
 * The reserved keys are read for the same reason and at the same time: a key
 * a removed-but-answered question still holds is not the builder's to give
 * away, and the builder cannot see tombstones from the document alone.
 */
const loadSurvey = cache(async (raw: string) => {
    const id = SurveyIdSchema.safeParse(raw);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return null;

    const db = await createServerDb();
    const record = await getSurvey(db, id.data);
    if (record === null) return null;

    const waves = await listSurveysInWaveGroup(db, record.survey.waveGroupId);
    // What makes an edit here destructive rather than merely undoable: taking
    // a choice out of a question that has been answered leaves those answers
    // with nothing on a chart to belong to (`aggregate`'s `unshownCount`).
    const responseCount = await countResponses(db, id.data);
    const reservedKeys = await listReservedQuestionKeys(db, id.data);
    return { record, waveCount: waves.length, responseCount, reservedKeys };
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

    const { record, waveCount, responseCount, reservedKeys } = found;

    return (
        <BuilderScreen
            surveyId={record.survey.id}
            initialSettings={{
                title: record.survey.title,
                description: record.survey.description,
                locale: record.survey.locale,
                waveLabel: record.survey.waveLabel
            }}
            // The builder edits one language: the survey's own, until the
            // translation surface lands (docs/DECISIONS.md 030).
            initialElements={resolveElements(
                record.survey.elements,
                record.survey.locale
            )}
            initialVersion={record.version}
            keys={{
                policy: keyPolicyFor({
                    publishedVersion: record.publishedVersion,
                    waveCount
                }),
                reserved: reservedKeys
            }}
            // A survey that has never been published has collected nothing and
            // emitted nothing, so its results page would be three empty states.
            hasResults={record.survey.slug !== null}
            responseCount={responseCount}
            status={record.survey.status}
            slug={record.survey.slug}
        />
    );
}
