import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import "@/app/globals.css";

import { AppDocument } from "@/components/shell/app-document";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireSessionUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Meta");
    return {
        title: { default: t("title"), template: `%s · ${t("title")}` },
        description: t("description")
    };
}

/**
 * One of three root layouts. The owner surfaces get their `lang` from the
 * locale cookie; the respondent runner will get its own root layout in Phase 6
 * so that it can take `lang` from `survey.locale`. See docs/DECISIONS.md 011.
 *
 * `requireSessionUser()` is the real access check. The proxy already turned
 * anonymous requests away, but a proxy is an optimistic filter — the Next.js
 * docs say so explicitly — and this layout renders the owner's own data.
 */
export default async function AppLayout({
    children
}: {
    readonly children: ReactNode;
}) {
    const user = await requireSessionUser();

    return (
        <AppDocument>
            <SidebarProvider>
                <AppSidebar user={user} />
                <SidebarInset className="min-w-0">{children}</SidebarInset>
            </SidebarProvider>
        </AppDocument>
    );
}
