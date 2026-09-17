import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { WaveComparisonScreen } from "@/components/results/wave-comparison-screen";
import { ComparisonIdSchema } from "@/domain/ids";
import { requireSessionUser } from "@/lib/auth/session";
import { loadComparisonView } from "@/lib/comparisons/load";
import { createServerDb } from "@/lib/supabase/server";

/**
 * One saved comparison, drawn (docs/DECISIONS.md 035).
 *
 * `requireSessionUser()` is the access check that counts; RLS scopes every
 * read, so a comparison that is not the caller's is the same 404 as one that
 * never existed.
 *
 * The comparison is built here, on the server: the client receives the
 * summaries, not every response of every wave it covers.
 */
const load = cache(async (raw: string) => {
    const id = ComparisonIdSchema.safeParse(raw);
    if (!id.success) return null;

    const db = await createServerDb();
    return loadComparisonView(db, id.data);
});

export async function generateMetadata({
    params
}: PageProps<"/comparisons/[comparisonId]">): Promise<Metadata> {
    const { comparisonId } = await params;
    const view = await load(comparisonId);
    if (view === null) return {};

    const t = await getTranslations("Waves");
    return { title: `${view.record.document.name} · ${t("title")}` };
}

export default async function ComparisonPage({
    params
}: PageProps<"/comparisons/[comparisonId]">) {
    await requireSessionUser();

    const { comparisonId } = await params;
    const view = await load(comparisonId);
    if (view === null) notFound();

    return (
        <WaveComparisonScreen
            comparisonId={view.record.id}
            waveGroupId={view.record.waveGroupId}
            name={view.record.document.name}
            comparison={view.comparison}
        />
    );
}
