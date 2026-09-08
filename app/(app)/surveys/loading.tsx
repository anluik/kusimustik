import { getTranslations } from "next-intl/server";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import {
    AppBarSkeleton,
    LoadingRegion,
    SkeletonRows
} from "@/components/shell/page-skeleton";
import { cn } from "@/lib/utils";

/**
 * The survey list while its two queries are in flight. DESIGN §6: the rows
 * keep the 46px height `SurveyTable` gives them, so the card does not resize
 * under the cursor when the real list arrives.
 */
export default async function SurveysLoading() {
    const t = await getTranslations("Common");

    return (
        <>
            <AppBarSkeleton actions={3} constrained />
            <LoadingRegion
                label={t("loading")}
                className={cn("flex flex-col gap-2 p-4", PAGE_WIDTH)}
            >
                <section className="overflow-hidden rounded border bg-card">
                    <SkeletonRows count={6} height="h-[46px]" />
                </section>
            </LoadingRegion>
        </>
    );
}
