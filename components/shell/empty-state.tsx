import type { ReactNode } from "react";

import { TITLE } from "@/components/type";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §6. A muted skeleton of the shape that will appear, then a 14px
 * semibold line naming what is missing, a 12px muted sentence explaining what
 * unblocks it, then the actions. Never an illustration.
 */
export function EmptyState({
    title,
    body,
    actions,
    preview
}: {
    readonly title: string;
    readonly body: string;
    readonly actions?: ReactNode;
    readonly preview: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 px-4 py-5">
            <div aria-hidden className="flex flex-col gap-px">
                {preview}
            </div>
            <div className="flex flex-col gap-1">
                <p className={cn(TITLE, "text-pretty")}>{title}</p>
                <p className="max-w-[60ch] text-[13px] leading-[1.5] text-pretty text-muted-foreground">
                    {body}
                </p>
            </div>
            {actions !== undefined && (
                <div className="flex items-center gap-2">{actions}</div>
            )}
        </div>
    );
}

/** One row of the skeleton the real list will fill. */
export function EmptyStateRow() {
    return <div className="h-8 rounded-lg border bg-ramp-track" />;
}
