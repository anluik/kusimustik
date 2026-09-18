import { getTranslations } from "next-intl/server";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import {
    AppBarSkeleton,
    LoadingRegion
} from "@/components/shell/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The toolbar, the wave strip and a few rows of selects (DESIGN §6). */
export default async function ComparisonMatchesLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={1} constrained />
            <LoadingRegion
                label={t("loading")}
                className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}
            >
                <Skeleton className="h-[30px] w-72 rounded-lg" />
                <Skeleton className="h-4 rounded-lg" />
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton
                            key={index}
                            className="h-[51px] rounded-lg border"
                        />
                    ))}
                </div>
            </LoadingRegion>
        </>
    );
}
