import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { WaveComparisonScreen } from "@/components/results/wave-comparison-screen";
import { WaveGroupIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import { listWaveGroupResponses } from "@/lib/db/waves";
import { createServerDb } from "@/lib/supabase/server";

/**
 * The wave comparison.
 *
 * `requireSessionUser()` is the access check that counts, and RLS scopes the
 * read — so a wave group that is not the caller's comes back empty and is the
 * same 404 as one that never existed. It has to be: a wave group id is a UUID
 * in the URL, and anything else would make the address an oracle for which
 * series exist.
 *
 * One repository call, three queries. The definitions and the responses are
 * fetched whole and aligned in the client component, for the same reason the
 * results page aggregates rather than asking Postgres to: `aggregate()` is the
 * domain's definition of a summary and there must be exactly one of those.
 */
const loadWaves = cache(async (raw: string) => {
    const id = WaveGroupIdSchema.safeParse(raw);
    // A malformed id in the URL is a 404, not a 500.
    if (!id.success) return null;

    const db = await createServerDb();
    const waves = await listWaveGroupResponses(db, id.data);
    return waves.length === 0 ? null : waves;
});

export async function generateMetadata({
    params
}: PageProps<"/waves/[waveGroupId]">): Promise<Metadata> {
    const { waveGroupId } = await params;
    const waves = await loadWaves(waveGroupId);
    if (waves === null) return {};

    const t = await getTranslations("Waves");
    return { title: `${newest(waves)} · ${t("title")}` };
}

export default async function WaveComparisonPage({
    params
}: PageProps<"/waves/[waveGroupId]">) {
    await requireSessionUser();

    const { waveGroupId } = await params;
    const waves = await loadWaves(waveGroupId);
    if (waves === null) notFound();

    // A group with one wave is not a comparison, but it is also not a mistake —
    // it is a series whose second wave has not been created yet. The screen
    // renders it as one wave beside itself and says how many it is comparing.
    return <WaveComparisonScreen waves={waves} title={newest(waves)} />;
}

/** The series is named for its newest wave: the wording the owner last chose. */
function newest(
    waves: Awaited<ReturnType<typeof listWaveGroupResponses>>
): string {
    return waves[waves.length - 1]?.survey.title ?? "";
}
