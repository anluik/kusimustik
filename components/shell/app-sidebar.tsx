import { getTranslations } from "next-intl/server";

import { LocaleTabs } from "@/components/shell/locale-tabs";
import { NavMain } from "@/components/shell/nav-main";
import { UserMenu } from "@/components/shell/user-menu";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader
} from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth/session";

/**
 * DESIGN.md §5, "App shell". The workspace header is deliberately not a
 * `DropdownMenu` yet: teams are post-MVP (PLAN, after-MVP item 10) and there is
 * exactly one workspace to switch to, so a trigger here would be dead UI.
 */
export async function AppSidebar({ user }: { readonly user: SessionUser }) {
    const t = await getTranslations("Nav");
    const meta = await getTranslations("Meta");

    return (
        <Sidebar collapsible="icon" className="border-sidebar-border">
            <SidebarHeader className="h-11 flex-row items-center gap-2 border-b px-3 py-0">
                <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-[3px] bg-primary"
                />
                <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-[13px] leading-[1.2] font-semibold">
                        {meta("title")}
                    </span>
                    <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                        {t("personalWorkspace")}
                    </span>
                </span>
            </SidebarHeader>

            <SidebarContent className="px-2 py-3">
                <SidebarGroup className="gap-2 p-0">
                    <SidebarGroupLabel className="h-auto px-3 font-mono text-[10px] leading-none tracking-[0.07em] uppercase">
                        {t("workspace")}
                    </SidebarGroupLabel>
                    <NavMain />
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="gap-2 border-t p-2">
                <div className="group-data-[collapsible=icon]:hidden">
                    <LocaleTabs />
                </div>
                <UserMenu name={user.displayName} email={user.email} />
            </SidebarFooter>
        </Sidebar>
    );
}
