import type { ReactNode } from "react";

import { AppBarFrame } from "@/components/shell/app-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The pieces every `loading.tsx` is built from (docs/PLAN.md Phase 8).
 *
 * DESIGN §6: a loading panel is skeleton blocks matching the final geometry —
 * the same heights and the same column widths, so nothing reflows when the
 * data arrives — and never a spinner in a panel whose shape is known. The app
 * bar keeps its sidebar toggle live throughout: navigating away from a slow
 * page is the one thing the owner might reasonably want to do while waiting.
 */

/** A bar of the right height, with placeholders where its buttons will be. */
export function AppBarSkeleton({
    actions = 1,
    constrained = false
}: {
    readonly actions?: number;
    /** Matches the page below it, so the bar does not shift on arrival. */
    readonly constrained?: boolean;
}) {
    return (
        <AppBarFrame
            constrained={constrained}
            actions={Array.from({ length: actions }, (_, index) => (
                <Skeleton key={index} className="h-[30px] w-24 rounded" />
            ))}
        >
            <Skeleton className="h-3.5 w-40 rounded" />
        </AppBarFrame>
    );
}

/**
 * The region the skeleton hangs in. `aria-busy` with a single polite label,
 * because a screen reader announcing forty placeholder blocks is worse than
 * one that says the page is loading.
 *
 * A `div`, and named for a region rather than for `main`: `SidebarInset`
 * already renders the page's `main` and a document may not nest one inside
 * another. Nothing is lost — `aria-busy` and `aria-live` belong to the element
 * that is busy, not to a landmark.
 */
export function LoadingRegion({
    label,
    className,
    children
}: {
    readonly label: string;
    readonly className?: string;
    readonly children: ReactNode;
}) {
    return (
        <div aria-busy="true" aria-live="polite" className={className}>
            <span className="sr-only">{label}</span>
            <div aria-hidden>{children}</div>
        </div>
    );
}

/** A stack of rows of the height the real ones will have. */
export function SkeletonRows({
    count,
    height = "h-8",
    className
}: {
    readonly count: number;
    /** The final row height — 46px in the survey list, 32px elsewhere. */
    readonly height?: string;
    readonly className?: string;
}) {
    return (
        <div className={cn("flex flex-col", className)}>
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    className={cn(
                        "flex items-center gap-3 border-b px-3 last:border-b-0",
                        height
                    )}
                >
                    <Skeleton className="h-3 flex-1 rounded" />
                    <Skeleton className="hidden h-3 w-20 rounded sm:block" />
                    <Skeleton className="hidden h-3 w-14 rounded sm:block" />
                </div>
            ))}
        </div>
    );
}

/** One card of the height a stat card settles at. */
export function SkeletonStatCard() {
    return (
        <div className="flex flex-col gap-2 rounded border bg-card px-3.5 py-3">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="h-2.5 w-28 rounded" />
        </div>
    );
}
