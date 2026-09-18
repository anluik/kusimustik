import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DisplayNameForm } from "@/components/settings/display-name-form";
import { AppBar } from "@/components/shell/app-bar";
import { LocaleTabs } from "@/components/shell/locale-tabs";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { requireSessionUser } from "@/lib/auth/session";
import { CODE, LABEL, TITLE } from "@/components/type";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Settings");
    return { title: t("title") };
}

/**
 * The account card. The email is Supabase's and is shown as it is; the display
 * name is the owner's to change, which is what `DisplayNameForm` is for — the
 * repository function and its policy existed from Phase 3, but nothing called
 * them, so a magic-link signup had no way to be called anything.
 */
export default async function SettingsPage() {
    const user = await requireSessionUser();
    const t = await getTranslations("Settings");
    const language = await getTranslations("Language");
    const theme = await getTranslations("Theme");

    return (
        <>
            <AppBar title={t("title")} />
            {/* A `div`: `SidebarInset` is the page's `main`, and a document
                may not nest one inside another. */}
            <div className="grid max-w-2xl gap-3 p-4">
                <Card className="gap-3 rounded-xl py-4">
                    <CardHeader className="px-4">
                        <CardTitle className={TITLE}>
                            {t("account.title")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 px-4">
                        <div className="grid gap-1">
                            <span className={LABEL}>{t("account.email")}</span>
                            <span className={CODE}>{user.email}</span>
                        </div>
                        <DisplayNameForm displayName={user.displayName} />
                    </CardContent>
                </Card>

                <Card className="gap-3 rounded-xl py-4">
                    <CardHeader className="px-4">
                        <CardTitle className={TITLE}>
                            {language("label")}
                        </CardTitle>
                        <CardDescription className="text-xs leading-[1.35]">
                            {language("description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="max-w-56 px-4">
                        <LocaleTabs />
                    </CardContent>
                </Card>

                <Card className="gap-3 rounded-xl py-4">
                    <CardHeader className="px-4">
                        <CardTitle className={TITLE}>
                            {theme("label")}
                        </CardTitle>
                        <CardDescription className="text-xs leading-[1.35]">
                            {theme("description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="max-w-56 px-4">
                        <ThemeToggle />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
