import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

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

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Settings");
    return { title: t("title") };
}

/**
 * Phase 3: the account row is read-only. Editing a display name is a mutation
 * and belongs with the rest of the CRUD in Phase 4.
 */
export default async function SettingsPage() {
    const user = await requireSessionUser();
    const t = await getTranslations("Settings");
    const language = await getTranslations("Language");
    const theme = await getTranslations("Theme");

    return (
        <>
            <AppBar title={t("title")} />
            <main className="grid max-w-2xl gap-3 p-4">
                <Card className="gap-3 rounded py-3">
                    <CardHeader className="px-3.5">
                        <CardTitle className="text-[13px] leading-[1.2] font-semibold">
                            {t("account.title")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2.5 px-3.5">
                        <div className="grid gap-1">
                            <span className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                                {t("account.email")}
                            </span>
                            <span className="font-mono text-[11px] leading-none">
                                {user.email}
                            </span>
                        </div>
                        <div className="grid gap-1">
                            <span className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                                {t("account.name")}
                            </span>
                            <span className="text-[13px] leading-[1.2] font-medium">
                                {user.displayName ?? t("account.nameMissing")}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="gap-3 rounded py-3">
                    <CardHeader className="px-3.5">
                        <CardTitle className="text-[13px] leading-[1.2] font-semibold">
                            {language("label")}
                        </CardTitle>
                        <CardDescription className="text-xs leading-[1.35]">
                            {language("description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="max-w-56 px-3.5">
                        <LocaleTabs />
                    </CardContent>
                </Card>

                <Card className="gap-3 rounded py-3">
                    <CardHeader className="px-3.5">
                        <CardTitle className="text-[13px] leading-[1.2] font-semibold">
                            {theme("label")}
                        </CardTitle>
                        <CardDescription className="text-xs leading-[1.35]">
                            {theme("description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="max-w-56 px-3.5">
                        <ThemeToggle />
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
