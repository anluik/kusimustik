import type { ReactNode } from "react";

/**
 * DESIGN.md §4: a panel header is 34px with the same 12px gutter as the rows
 * under it, and its title is the Label level — Mono 10px, uppercase, wide
 * tracking — so it reads as chrome rather than as content.
 */
export function PanelHeader({
    title,
    meta,
    actions
}: {
    readonly title: string;
    readonly meta?: ReactNode;
    readonly actions?: ReactNode;
}) {
    return (
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-b px-3">
            <h2 className="truncate font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                {title}
            </h2>
            {meta !== undefined && (
                <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                    {meta}
                </span>
            )}
            {actions !== undefined && (
                <div className="ml-auto flex items-center gap-1">{actions}</div>
            )}
        </div>
    );
}
