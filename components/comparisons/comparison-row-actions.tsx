"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmDialog } from "@/components/shell/confirm-dialog";
import { ErrorLine } from "@/components/shell/error-line";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComparisonNameSchema } from "@/domain/comparison";
import type { ComparisonId } from "@/domain/ids";
import {
    deleteComparisonAction,
    renameComparisonAction
} from "@/lib/comparisons/actions";
import type { ComparisonActionError } from "@/lib/comparisons/errors";
import { ROUTES } from "@/lib/routes";

type RowDialog = "rename" | "delete";

/**
 * One saved comparison's menu (DESIGN §5): open, edit matches, rename, delete.
 * The dialogs are siblings of the menu, as the survey list's are, because a
 * dialog inside `DropdownMenuContent` unmounts when the menu closes.
 */
export function ComparisonRowActions({
    comparisonId,
    name
}: {
    readonly comparisonId: ComparisonId;
    readonly name: string;
}) {
    const t = useTranslations("Waves.rowActions");
    const tDelete = useTranslations("Waves.delete");
    const tErrors = useTranslations("Waves.errors");
    const [dialog, setDialog] = useState<RowDialog | null>(null);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("label")}
                        className="rounded text-muted-foreground"
                    >
                        <MoreHorizontal aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded">
                    <DropdownMenuItem asChild className="rounded text-xs">
                        <Link href={ROUTES.comparison(comparisonId)}>
                            {t("open")}
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded text-xs">
                        <Link href={ROUTES.comparisonMatches(comparisonId)}>
                            {t("editMatches")}
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="rounded text-xs"
                        onSelect={() => setDialog("rename")}
                    >
                        {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        className="rounded text-xs"
                        onSelect={() => setDialog("delete")}
                    >
                        {t("delete")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <RenameComparisonDialog
                comparisonId={comparisonId}
                name={name}
                open={dialog === "rename"}
                onOpenChange={open => setDialog(open ? "rename" : null)}
            />

            <ConfirmDialog
                destructive
                open={dialog === "delete"}
                onOpenChange={open => setDialog(open ? "delete" : null)}
                title={tDelete("title")}
                body={tDelete("body", { name })}
                confirmLabel={tDelete("submit")}
                run={() => deleteComparisonAction({ comparisonId })}
                errorMessage={error => tErrors(error)}
            />
        </>
    );
}

const RenameSchema = z.object({ name: ComparisonNameSchema });
type RenameValues = z.infer<typeof RenameSchema>;

function RenameComparisonDialog({
    comparisonId,
    name,
    open,
    onOpenChange
}: {
    readonly comparisonId: ComparisonId;
    readonly name: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("Waves.rename");
    const tErrors = useTranslations("Waves.errors");
    const tCommon = useTranslations("Common");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<ComparisonActionError | null>(null);

    const form = useForm<RenameValues>({
        resolver: zodResolver(RenameSchema),
        values: { name }
    });

    function close() {
        form.reset({ name });
        setError(null);
        onOpenChange(false);
    }

    function onSubmit(values: RenameValues) {
        setError(null);
        startTransition(async () => {
            const result = await renameComparisonAction({
                comparisonId,
                name: values.name
            });
            if (result.ok) onOpenChange(false);
            else setError(result.error);
        });
    }

    const id = `rename-${comparisonId}`;

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (next) onOpenChange(true);
                else close();
            }}
        >
            <DialogContent className="gap-3 rounded p-3.5 sm:max-w-md">
                <DialogHeader className="gap-1">
                    <DialogTitle className="text-[13px] leading-[1.2] font-semibold">
                        {t("title")}
                    </DialogTitle>
                </DialogHeader>
                <form
                    noValidate
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="grid gap-2.5"
                >
                    <div className="grid gap-1.5">
                        <Label
                            htmlFor={id}
                            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
                        >
                            {t("label")}
                        </Label>
                        <Input
                            id={id}
                            autoFocus
                            autoComplete="off"
                            aria-invalid={
                                form.formState.errors.name !== undefined
                            }
                            className="h-[30px] rounded text-xs"
                            {...form.register("name")}
                        />
                    </div>
                    <ErrorLine
                        message={error === null ? null : tErrors(error)}
                    />
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={close}
                            className="h-[30px] rounded text-xs"
                        >
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={pending}
                            className="h-[30px] rounded text-xs"
                        >
                            {t("submit")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
