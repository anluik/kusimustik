import { getTranslations } from "next-intl/server";

import { AppBarSkeleton, LoadingMain } from "@/components/shell/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The builder's three panels, at the widths they settle at: 268px of element
 * list, the canvas, 340px of editor. The two side panels are hidden at the
 * same breakpoints the real ones are, so a phone does not flash a layout it
 * will never see.
 */
export default async function BuilderLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={3} />
            <LoadingMain
                label={t("loading")}
                className="h-[calc(100svh-2.75rem)] min-h-0"
            >
                <div className="flex h-full min-h-0">
                    <div className="hidden w-[268px] shrink-0 flex-col gap-1 border-r p-2 md:flex">
                        {Array.from({ length: 6 }, (_, index) => (
                            <Skeleton key={index} className="h-8 rounded" />
                        ))}
                    </div>

                    <div className="flex flex-1 flex-col gap-3 p-4">
                        {Array.from({ length: 4 }, (_, index) => (
                            <Skeleton
                                key={index}
                                className="h-24 rounded border"
                            />
                        ))}
                    </div>

                    <div className="hidden w-[340px] shrink-0 flex-col gap-3 border-l p-3.5 lg:flex">
                        <Skeleton className="h-3.5 w-24 rounded" />
                        {Array.from({ length: 5 }, (_, index) => (
                            <Skeleton key={index} className="h-8 rounded" />
                        ))}
                    </div>
                </div>
            </LoadingMain>
        </>
    );
}
