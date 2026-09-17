"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { ErrorLine } from "@/components/shell/error-line";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The confirm step for an action the owner should not take by accident.
 *
 * `AlertDialogAction` is deliberately not used for the confirm button — it
 * closes the dialog on click, and a failed action needs its error rendered
 * with the dialog still open (§6: never a toast for something the owner must
 * act on).
 */
export function ConfirmDialog<TError extends string>({
    open,
    onOpenChange,
    title,
    body,
    confirmLabel,
    destructive = false,
    run,
    errorMessage
}: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly title: string;
    readonly body: ReactNode;
    readonly confirmLabel: string;
    readonly destructive?: boolean;
    readonly run: () => Promise<ActionResult<unknown, TError>>;
    /** The sentence for a failure code, from the caller's own catalogue. */
    readonly errorMessage: (error: TError) => string;
}) {
    const tCommon = useTranslations("Common");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<TError | null>(null);

    function close() {
        setError(null);
        onOpenChange(false);
    }

    function confirm() {
        setError(null);
        startTransition(async () => {
            const result = await run();
            if (result.ok) onOpenChange(false);
            else setError(result.error);
        });
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={next => {
                if (next) onOpenChange(true);
                else close();
            }}
        >
            <AlertDialogContent className="gap-3 rounded p-3.5 sm:max-w-md">
                <AlertDialogHeader className="gap-1">
                    <AlertDialogTitle className="text-[13px] leading-[1.2] font-semibold">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-xs leading-[1.35]">
                        {body}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <ErrorLine
                    message={error === null ? null : errorMessage(error)}
                />

                <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel
                        disabled={pending}
                        className="h-[30px] rounded text-xs"
                    >
                        {tCommon("cancel")}
                    </AlertDialogCancel>
                    <Button
                        type="button"
                        size="sm"
                        variant={destructive ? "destructive" : "default"}
                        disabled={pending}
                        onClick={confirm}
                        className="h-[30px] rounded text-xs"
                    >
                        {confirmLabel}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
