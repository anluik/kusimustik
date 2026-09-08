import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AppBar } from "@/components/shell/app-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The owner app's 404.
 *
 * `notFound()` resolves to the *nearest* `not-found.tsx`, and until this file
 * existed there was none between `app/(app)/**` and Next.js's own built-in
 * page — so a bookmark to a deleted survey, or a mistyped id, answered a
 * signed-in Estonian owner with "404 · This page could not be found" in
 * English, inside a fully localized shell. `app/global-not-found.tsx` could
 * not cover it: with `globalNotFound` it serves whole documents for requests
 * that match no route at all, and these match `/surveys/[surveyId]` perfectly
 * well — the survey behind the id is what is missing.
 *
 * It keeps the sidebar, because DESIGN §6 wants the chrome to stay on screen
 * for a partial failure, and because the way out of here is the survey list
 * the sidebar is already pointing at.
 */
export default async function AppNotFound() {
    const t = await getTranslations("NotFound");

    return (
        <>
            <AppBar constrained title={t("title")} />
            {/* A `div`: `SidebarInset` is the page's `main` already. */}
            <div className={cn("p-4", PAGE_WIDTH)}>
                <Card className="max-w-md gap-3 rounded px-3.5 py-3">
                    {/* The bar's heading already says what happened, so the
                        card carries the explanation and the way out, not a
                        second copy of the title. */}
                    <p className="max-w-prose text-xs leading-[1.35] text-muted-foreground">
                        {t("body")}
                    </p>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-[30px] w-fit rounded text-xs"
                    >
                        <Link href={ROUTES.surveys}>{t("action")}</Link>
                    </Button>
                </Card>
            </div>
        </>
    );
}
