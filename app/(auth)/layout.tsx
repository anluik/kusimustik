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
 */
export default function AuthLayout({
    children
}: {
    readonly children: ReactNode;
}) {
    return (
        <AppDocument>
            <div className="grid min-h-svh place-items-center p-4">
                {children}
            </div>
        </AppDocument>
    );
}
