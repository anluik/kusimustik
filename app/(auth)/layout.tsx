import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import "@/app/globals.css";

import { AppDocument } from "@/components/shell/app-document";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Meta");
    return {
        title: { default: t("title"), template: `%s · ${t("title")}` },
        description: t("description")
    };
}

/**
 * The signed-out root layout: no sidebar, no session, one centred card. Kept
 * separate from `(app)` so that layout can assume a user exists.
 *
 * The centring wrapper is the `main` landmark. There is no shell here to carry
 * one — `(app)` gets its `main` from `SidebarInset` and the runner renders its
 * own — and a page with no landmark at all leaves a screen-reader user nothing
 * to jump to.
 */
export default function AuthLayout({
    children
}: {
    readonly children: ReactNode;
}) {
    return (
        <AppDocument>
            <main className="grid min-h-svh place-items-center p-4">
                {children}
            </main>
        </AppDocument>
    );
}
