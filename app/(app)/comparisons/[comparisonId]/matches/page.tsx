import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { MatchingEditor } from "@/components/comparisons/matching-editor";
import { orderRows } from "@/domain/comparison";
import { ComparisonIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import type { GroupWave } from "@/lib/comparisons/group";
import { toComparisonWaves } from "@/lib/comparisons/group";
import { getComparison } from "@/lib/db/comparisons";
import { listSurveyStats } from "@/lib/db/surveys";
import { listWaveGroup } from "@/lib/db/waves";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The matching editor for one comparison (docs/DECISIONS.md 035).
 *
 * Every wave of the group is read, with definitions and without responses —
 * the editor offers each wave's questions and can add any wave to the
 * comparison. The rows are put in questionnaire order once, here, and the
 * editor keeps that order for the session rather than re-sorting under the
 * owner's pointer.
 */
const load = cache(async (raw: string) => {
    const id = ComparisonIdSchema.safeParse(raw);
    if (!id.success) return null;

    const db = await createServerDb();
    const record = await getComparison(db, id.data);
    if (record === null) return null;

    const [waves, stats] = await Promise.all([
        listWaveGroup(db, record.waveGroupId),
        listSurveyStats(db)
    ]);
    const group: GroupWave[] = waves.map(wave => ({
        surveyId: wave.survey.id,
        waveLabel: wave.survey.waveLabel ?? null,
        createdAt: wave.createdAt,
        responseCount: stats.get(wave.survey.id)?.responseCount ?? 0,
        elements: wave.survey.elements
    }));
    const covered = toComparisonWaves(group).filter(wave =>
        record.document.surveyIds.includes(wave.surveyId)
    );

    return {
        record,
        group,
        document: {
            ...record.document,
            rows: orderRows(covered, record.document.rows)
        }
    };
});

export async function generateMetadata({
    params
}: PageProps<"/comparisons/[comparisonId]/matches">): Promise<Metadata> {
    const { comparisonId } = await params;
    const found = await load(comparisonId);
    if (found === null) return {};

    const t = await getTranslations("Waves.matches");
    return { title: `${found.document.name} · ${t("title")}` };
}

export default async function ComparisonMatchesPage({
    params
}: PageProps<"/comparisons/[comparisonId]/matches">) {
    await requireSessionUser();

    const { comparisonId } = await params;
    const found = await load(comparisonId);
    if (found === null) notFound();

    return (
        <MatchingEditor
            comparisonId={found.record.id}
            initialDocument={found.document}
            initialVersion={found.record.version}
            group={found.group}
        />
    );
}
