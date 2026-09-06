"use client";

import { useTranslations } from "next-intl";

import { assertNever } from "@/domain/assert-never";
import type { BuilderSaveStatus } from "@/hooks/use-survey-builder";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §5: the autosave says what it is doing with a dot and a line of
 * Mono in the app bar — not a toast, and not a spinner over the canvas. §6:
 * when it fails, the dot goes destructive and the recovery is an underlined
 * action right next to it, because this is something the owner has to act on.
 *
 * A conflict is offered a reload rather than a retry: another tab has already
 * saved, so trying again with the version this tab holds would fail exactly
 * the same way. Everything else is worth one more attempt.
 */
export function SaveIndicator({
    status,
    onRetry
}: {
    readonly status: BuilderSaveStatus;
    readonly onRetry: () => void;
}) {
    const t = useTranslations("Builder.save");

    const dot = (className: string) => (
        <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", className)}
        />
    );

    const body = () => {
        switch (status.kind) {
            case "clean":
                return (
                    <>
                        {dot("bg-muted-foreground/50")}
                        {t("saved")}
                    </>
                );
            case "pending":
                return (
                    <>
                        {dot("border border-muted-foreground")}
                        {t("pending")}
                    </>
                );
            case "saving":
                return (
                    <>
                        {dot("animate-pulse bg-muted-foreground")}
                        {t("saving")}
                    </>
                );
            case "invalid":
                return (
                    <>
                        {dot("bg-destructive")}
                        <span className="text-destructive">{t("invalid")}</span>
                    </>
                );
            case "failed":
                return (
                    <>
                        {dot("bg-destructive")}
                        <span className="text-destructive">{t("failed")}</span>
                        {status.error === "conflict" ? (
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="underline underline-offset-2 hover:text-foreground focus-visible:rounded-xs focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                            >
                                {t("reload")}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="underline underline-offset-2 hover:text-foreground focus-visible:rounded-xs focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                            >
                                {t("retry")}
                            </button>
                        )}
                    </>
                );
            default:
                return assertNever(status, "save status");
        }
    };

    return (
        <span role="status" className="flex items-center gap-1.5">
            {/* "saved" on its own is a word with no subject when it is read
                out of a live region. */}
            <span className="sr-only">{t("label")}: </span>
            {body()}
        </span>
    );
}
