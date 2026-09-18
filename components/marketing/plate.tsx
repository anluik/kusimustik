import type { ReactNode } from "react";

import { LABEL, TAG } from "@/components/type";
import { cn } from "@/lib/utils";

/**
 * One owner-side panel on the landing page: a card at the owner surfaces' own
 * density (DESIGN.md §4), so they read as the app rather than as marketing
 * furniture. Header is a §2 `LABEL`, sentence case, 11px, muted.
 *
 * Three slots, and the middle one is not decoration. `note` carries the
 * *demonstration data* tag on any plate whose figures were not produced by the
 * reader, and it sits beside the plate's name rather than at the far end of the
 * row: a disclosure that has to be hunted for at the opposite edge of a card is
 * a disclosure the page is hiding.
 */
export function Plate({
    label,
    note,
    aside,
    className,
    children
}: {
    readonly label: string;
    readonly note?: string | undefined;
    readonly aside?: string | undefined;
    readonly className?: string | undefined;
    readonly children: ReactNode;
}) {
    return (
        <section
            className={cn(
                "flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 shadow-xs",
                className
            )}
        >
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className={LABEL}>{label}</h3>
                {note !== undefined && (
                    <p
                        className={cn(
                            TAG,
                            "rounded-full bg-muted px-2 py-1 text-muted-foreground"
                        )}
                    >
                        {note}
                    </p>
                )}
                {aside !== undefined && (
                    <p className="ml-auto text-[12px] leading-none text-muted-foreground tabular-nums">
                        {aside}
                    </p>
                )}
            </header>
            {children}
        </section>
    );
}
