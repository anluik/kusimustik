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
                                // DESIGN §6: disabled is a colour change, never
                                // an opacity one — opacity stacking breaks the
                                // audited contrast.
                                className="h-8 cursor-not-allowed gap-1.5 px-3 text-xs text-input opacity-100!"
                                tooltip={label}
                            >
                                <Icon aria-hidden />
                                <span>{label}</span>
                            </SidebarMenuButton>
                            <Badge
                                variant="outline"
                                className="pointer-events-none absolute top-1.5 right-2 h-4 rounded px-1 font-mono text-[9px] tracking-[0.04em] text-input uppercase group-data-[collapsible=icon]:hidden"
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
                            className="h-8 gap-1.5 rounded px-3 text-xs data-active:shadow-[inset_2px_0_0_var(--primary)]"
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
