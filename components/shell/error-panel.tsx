"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * What an owner sees when a segment throws (docs/PLAN.md Phase 8).
 *
 * DESIGN §6: text-first, local to what failed, with a retry — never a toast
 * for something the user has to act on, and never an illustration. The digest
 * is shown because it is the only handle either of us has on the server log
 * entry; it is rendered in Mono as data rather than described in prose.
 */
export function ErrorPanel({
    digest,
    onRetry
}: {
    readonly digest?: string | undefined;
    readonly onRetry: () => void;
}) {
    const t = useTranslations("Errors");
    const common = useTranslations("Common");

    return (
        <div
            role="alert"
            className="m-4 flex max-w-prose flex-col gap-3 rounded border bg-card px-3.5 py-3"
        >
            <div className="flex flex-col gap-1">
                <p className="flex items-start gap-1.5 text-[14px] leading-[1.35] font-semibold">
                    <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-4xl bg-destructive"
                    />
                    {t("title")}
                </p>
                <p className="text-xs leading-[1.35] text-muted-foreground">
                    {t("body")}
                </p>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="h-[30px] rounded text-xs"
                >
                    {common("retry")}
                </Button>
                {digest !== undefined && (
                    <span className="font-mono text-[10px] leading-none tracking-[0.04em] text-muted-foreground">
                        {t("reference")} {digest}
                    </span>
                )}
            </div>
        </div>
    );
}
