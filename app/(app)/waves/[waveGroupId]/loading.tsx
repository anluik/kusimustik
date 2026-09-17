import { getTranslations } from "next-intl/server";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import {
    AppBarSkeleton,
    LoadingRegion
} from "@/components/shell/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The group's comparison list: a header row and a few rows of the table the
 * page will draw (DESIGN §6 — the same geometry, so nothing reflows).
 */
export default async function WaveGroupLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={2} constrained />
            <LoadingRegion
                label={t("loading")}
                className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}
            >
                <div className="flex flex-col gap-px overflow-hidden rounded border">
                    <Skeleton className="h-[30px] rounded-none" />
                    {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton
                            key={index}
                            className="h-[42px] rounded-none"
                        />
                    ))}
                </div>
            </LoadingRegion>
        </>
    );
}
