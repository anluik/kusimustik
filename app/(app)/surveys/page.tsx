import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSessionUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Surveys");
    return { title: t("title") };
}

/**
 * Phase 3 ships the shell around the list, not the list: creating, listing and
 * publishing are Phase 4, so this always renders the empty state and never
 * queries. The create action is present but disabled, carrying the same
 * "coming soon" badge as the Templates nav item (DESIGN §6) rather than
 * appearing later and changing the shape of the page.
 */
export default async function SurveysPage() {
    await requireSessionUser();
    const t = await getTranslations("Surveys");
    const tCommon = await getTranslations("Common");

    return (
        <>
            <AppBar
                title={t("title")}
                meta={t("count", { count: 0 })}
                actions={
                    <Button
                        disabled
                        size="sm"
                        variant="outline"
                        className="h-[30px] cursor-not-allowed rounded text-xs text-input opacity-100!"
                    >
                        {t("new")}
                    </Button>
                }
            />
            <main className="p-4">
                <section className="rounded border bg-card">
                    <EmptyState
                        title={t("empty.title")}
                        body={t("empty.body")}
                        preview={
                            <>
                                <EmptyStateRow />
                                <EmptyStateRow />
                                <EmptyStateRow />
                            </>
                        }
                        actions={
                            <>
                                <Button
                                    disabled
                                    size="sm"
                                    variant="outline"
                                    className="h-[30px] cursor-not-allowed rounded text-xs text-input opacity-100!"
                                >
                                    {t("empty.action")}
                                </Button>
                                <Badge
                                    variant="outline"
                                    className="h-5 rounded px-1.5 font-mono text-[9px] tracking-[0.04em] text-muted-foreground uppercase"
                                >
                                    {tCommon("comingSoon")}
                                </Badge>
                            </>
                        }
                    />
                </section>
            </main>
        </>
    );
}
