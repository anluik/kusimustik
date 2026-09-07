import type { ReactNode } from "react";

import { LABEL, META, METRIC } from "@/components/results/type";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §5: header and content collapsed into one padded stack — so `Card`
 * alone, not `CardHeader`/`CardContent`, which would add their own rhythm.
 * §3: owner card padding is `px-3.5 py-3`.
 *
 * A figure that is not known renders as the em dash from the catalogue with a
 * different hint, never as a zero. "0% completed" and "nobody has started yet"
 * are different statements and only one of them is true.
 */
export function StatCard({
    label,
    value,
    hint,
    badge,
    className
}: {
    readonly label: string;
    readonly value: string;
    readonly hint: string;
    /** The live indicator, where a figure has one. */
    readonly badge?: ReactNode;
    readonly className?: string;
}) {
    return (
        <Card className={cn("gap-2 rounded px-3.5 py-3", className)}>
            <div className="flex items-center gap-1.5">
                <span className={cn(LABEL, "text-muted-foreground")}>
                    {label}
                </span>
                {badge}
            </div>
            <p className={METRIC}>{value}</p>
            <p className={cn(META, "truncate text-muted-foreground")}>{hint}</p>
        </Card>
    );
}
