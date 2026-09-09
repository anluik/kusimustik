import { getTranslations } from "next-intl/server";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import {
    AppBarSkeleton,
    LoadingRegion
} from "@/components/shell/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The comparison reads every wave's whole response set, so this is a state the
 * owner will see. DESIGN §6: the geometry that must not move is the wave strip
 * at the top — it is the legend for every chart below it, and a jump there
 * moves the cards the owner is reading.
 */
export default async function WaveComparisonLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={1} constrained />
            <LoadingRegion
                label={t("loading")}
                className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}
            >
                <Skeleton className="h-[76px] rounded border" />

                <div className="flex flex-col gap-3">
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="h-64 rounded border" />
                    ))}
                </div>
            </LoadingRegion>
        </>
    );
}
