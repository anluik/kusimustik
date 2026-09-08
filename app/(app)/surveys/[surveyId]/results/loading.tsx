import { getTranslations } from "next-intl/server";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import {
    AppBarSkeleton,
    LoadingRegion,
    SkeletonStatCard
} from "@/components/shell/page-skeleton";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Results waits on four queries and one whole response set, so it is the page
 * most likely to be seen in this state. The four stat cards and the tab strip
 * are the geometry that must not move: they sit above the cards the owner is
 * about to read, and a jump there loses their place.
 */
export default async function ResultsLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={2} constrained />
            <LoadingRegion
                label={t("loading")}
                className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}
            >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <SkeletonStatCard key={index} />
                    ))}
                </div>

                <Skeleton className="h-8 w-64 rounded" />

                <div className="flex flex-col gap-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-56 rounded border" />
                    ))}
                </div>
            </LoadingRegion>
        </>
    );
}
