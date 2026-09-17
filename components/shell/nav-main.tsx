"use client";

import { ClipboardList, LayoutTemplate, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { TAG } from "@/components/type";

/**
 * `href: null` marks a destination that does not exist yet. DESIGN.md §6:
 * such an item stays in place, disabled, carrying a "coming soon" outline
 * badge, so the shape of the menu does not change when it ships.
 */
const NAV_ITEMS = [
    { key: "surveys", href: ROUTES.surveys, icon: ClipboardList },
    { key: "templates", href: null, icon: LayoutTemplate },
    { key: "settings", href: ROUTES.settings, icon: Settings2 }
] as const;

export function NavMain() {
    const t = useTranslations("Nav");
    const tCommon = useTranslations("Common");
    const pathname = usePathname();

    return (
        <SidebarMenu className="gap-px">
            {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
                const label = t(key);

                if (href === null) {
                    return (
                        <SidebarMenuItem key={key}>
                            <SidebarMenuButton
                                disabled
                                // Coloured, not dimmed: app/globals.css (DESIGN §6).
                                className="h-8 gap-1.5 px-3 text-xs"
                                tooltip={label}
                            >
                                <Icon aria-hidden />
                                <span>{label}</span>
                            </SidebarMenuButton>
                            <Badge
                                variant="outline"
                                className={cn(
                                    TAG,
                                    "pointer-events-none absolute top-1.5 right-2 h-4 rounded-lg px-1 text-input group-data-[collapsible=icon]:hidden"
                                )}
                            >
                                {tCommon("comingSoon")}
                            </Badge>
                        </SidebarMenuItem>
                    );
                }

                const isActive =
                    pathname === href || pathname.startsWith(`${href}/`);

                return (
                    <SidebarMenuItem key={key}>
                        <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={label}
                            // DESIGN §5: the active nav item keeps its size and
                            // gains a 2px inset primary rule, so hover never
                            // hides which item is selected.
                            className="h-8 gap-1.5 rounded-lg px-3 text-xs data-active:shadow-[inset_2px_0_0_var(--primary)]"
                        >
                            <Link href={href}>
                                <Icon aria-hidden />
                                <span>{label}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );
}
