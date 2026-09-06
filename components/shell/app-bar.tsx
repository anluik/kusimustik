import type { ReactNode } from "react";

import { SidebarToggle } from "@/components/shell/sidebar-toggle";

/**
 * DESIGN.md §4: 44px tall, 16px page padding. §5: the title and its count are
 * a plain heading plus a Mono span — no primitive.
 */
export function AppBar({
    title,
    meta,
    actions
}: {
    readonly title: string;
    readonly meta?: ReactNode;
    readonly actions?: ReactNode;
}) {
    return (
        <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-3 border-b bg-background px-4">
            <SidebarToggle />
            <h1 className="text-[13px] leading-[1.2] font-semibold">{title}</h1>
            {meta !== undefined && (
                <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                    {meta}
                </span>
            )}
            {actions !== undefined && (
                <div className="ml-auto flex items-center gap-2">{actions}</div>
            )}
        </header>
    );
}
