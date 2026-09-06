"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { ThemeMenuItems } from "@/components/shell/theme-menu-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

/** First letters of the display name, or of the email when there is none. */
function initials(name: string | null, email: string | null): string {
    const source = name ?? email?.split("@")[0] ?? "";
    const letters = source
        .split(/[\s._-]+/)
        .filter(part => part.length > 0)
        .slice(0, 2)
        .map(part => part[0] ?? "");
    return letters.join("").toUpperCase();
}

export function UserMenu({
    name,
    email
}: {
    readonly name: string | null;
    readonly email: string | null;
}) {
    const t = useTranslations("UserMenu");

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label={t("label")}
                className="flex h-11 w-full items-center gap-2 rounded px-2 text-left outline-none hover:bg-sidebar-accent focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18"
            >
                <Avatar className="size-6 shrink-0 rounded">
                    <AvatarFallback className="rounded bg-accent font-mono text-[10px] text-accent-foreground">
                        {initials(name, email)}
                    </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-[13px] leading-[1.2] font-medium">
                        {name ?? email}
                    </span>
                    {name !== null && email !== null && (
                        <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                            {email}
                        </span>
                    )}
                </span>
                <MoreHorizontal
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
                />
            </DropdownMenuTrigger>

            <DropdownMenuContent
                side="top"
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded"
            >
                <ThemeMenuItems />
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="text-xs">
                    <Link href={ROUTES.settings}>{t("settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-xs">
                    {/* A form, not an onClick: signing out is a mutation, and
                        this way it still works before hydration. */}
                    <form action={signOut}>
                        <button type="submit" className="w-full text-left">
                            {t("signOut")}
                        </button>
                    </form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
