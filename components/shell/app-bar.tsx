import type { ReactNode } from "react";

import { PAGE_WIDTH } from "@/components/shell/page-width";
import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §4: 44px tall, 16px page padding. §5: the title and its count are
 * a plain heading plus a Mono span — no primitive.
 */
export function AppBar({
    title,
    meta,
    actions,
    constrained
}: {
    readonly title: string;
    readonly meta?: ReactNode;
    readonly actions?: ReactNode;
    /** See `AppBarFrame`. */
    readonly constrained?: boolean;
}) {
    return (
        <AppBarFrame
            actions={actions}
            {...(constrained !== undefined && { constrained })}
        >
            <h1 className="text-[13px] leading-[1.2] font-semibold">{title}</h1>
            {meta !== undefined && (
                <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                    {meta}
                </span>
            )}
        </AppBarFrame>
    );
}

/**
 * The bar without its contents, so the loading skeleton is the same geometry
 * rather than a second copy of it — DESIGN §6 asks that nothing reflows when
 * the real thing arrives, which a duplicated header cannot promise.
 */
export function AppBarFrame({
    children,
    actions,
    constrained = false
}: {
    readonly children: ReactNode;
    readonly actions?: ReactNode;
    /**
     * Holds the bar's contents to `PAGE_WIDTH`, for pages whose content is
     * held to it too. The bar itself still spans the window — it is chrome,
     * and a hairline that stopped short of the edge would read as a panel.
     * Off for the builder, which is full-width by design.
     */
    readonly constrained?: boolean;
}) {
    return (
        <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center border-b bg-background px-4">
            <div
                className={cn(
                    "flex min-w-0 flex-1 items-center gap-3",
                    constrained && PAGE_WIDTH
                )}
            >
                <SidebarToggle />
                {children}
                {actions !== undefined && (
                    <div className="ml-auto flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </header>
    );
}
