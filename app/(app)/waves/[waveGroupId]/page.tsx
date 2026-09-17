import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { ComparisonListScreen } from "@/components/comparisons/comparison-list-screen";
import { WaveGroupIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import type { GroupWave } from "@/lib/comparisons/group";
import { listComparisons } from "@/lib/db/comparisons";
import { listSurveyStats } from "@/lib/db/surveys";
import { listWaveGroup } from "@/lib/db/waves";
import { createServerDb } from "@/lib/supabase/server";

/**
 * One recurring survey's saved comparisons (docs/DECISIONS.md 035).
 *
 * `requireSessionUser()` is the access check that counts, and RLS scopes the
 * reads — so a wave group that is not the caller's comes back empty and is the
 * same 404 as one that never existed. It has to be: the id is a UUID in the
 * URL, and anything else would make the address an oracle for which series
 * exist.
 *
 * The waves are read with their definitions but without their responses: the
 * list names them and the new-comparison dialog offers them, and neither needs
 * an answer.
 */
const loadGroup = cache(async (raw: string) => {
    const id = WaveGroupIdSchema.safeParse(raw);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return null;

    const db = await createServerDb();
    const waves = await listWaveGroup(db, id.data);
    if (waves.length === 0) return null;

    const [stats, comparisons] = await Promise.all([
        listSurveyStats(db),
        listComparisons(db, id.data)
    ]);
    const group: GroupWave[] = waves.map(wave => ({
        surveyId: wave.survey.id,
        waveLabel: wave.survey.waveLabel ?? null,
        createdAt: wave.createdAt,
        responseCount: stats.get(wave.survey.id)?.responseCount ?? 0,
        elements: wave.survey.elements
    }));

    return {
        waveGroupId: id.data,
        // The series is named for its newest wave: the wording the owner
        // last chose.
        title: waves.at(-1)?.survey.title ?? "",
        group,
        comparisons
    };
});

export async function generateMetadata({
    params
}: PageProps<"/waves/[waveGroupId]">): Promise<Metadata> {
    const { waveGroupId } = await params;
    const found = await loadGroup(waveGroupId);
    if (found === null) return {};

    const t = await getTranslations("Waves");
    return { title: `${found.title} · ${t("title")}` };
}

export default async function WaveGroupPage({
    params
}: PageProps<"/waves/[waveGroupId]">) {
    await requireSessionUser();

    const { waveGroupId } = await params;
    const found = await loadGroup(waveGroupId);
    if (found === null) notFound();

    return <ComparisonListScreen {...found} />;
}
