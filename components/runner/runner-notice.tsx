"use client";

import { useTranslations } from "next-intl";

/**
 * The runner's three terminal screens: the link matched nothing, the survey
 * has stopped collecting, and the answers are in.
 *
 * A client component so it takes its wording from the `NextIntlClientProvider`
 * the root layout set up from `survey.locale` — a server component under that
 * layout has no translator, because the runner deliberately does not go
 * through `lib/i18n/request.ts` (docs/DECISIONS.md 011). The three namespaces
 * are read unconditionally and chosen between, rather than composed from the
 * `kind`, so every key is a literal the type checker can see.
 */
export function RunnerNotice({
    kind
}: {
    readonly kind: "notFound" | "closed" | "thanks";
}) {
    const notFound = useTranslations("RunnerNotFound");
    const closed = useTranslations("RunnerClosed");
    const thanks = useTranslations("RunnerThanks");

    const t =
        kind === "notFound" ? notFound : kind === "closed" ? closed : thanks;

    return (
        <main className="grid min-h-svh place-items-center p-3.5">
            <div className="flex w-full max-w-[420px] flex-col gap-2 rounded-survey border bg-survey-card px-3.5 py-4">
                <h1 className="text-[17px] leading-[1.3] font-semibold">
                    {t("title")}
                </h1>
                <p className="text-[14px] leading-[1.35] text-muted-foreground">
                    {t("body")}
                </p>
            </div>
        </main>
    );
}
