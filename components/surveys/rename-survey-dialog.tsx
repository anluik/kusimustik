"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ActionError } from "@/components/surveys/action-error";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SurveyId } from "@/domain/ids";
import { SurveyTitleSchema } from "@/domain/survey";
import { renameSurveyAction } from "@/lib/surveys/actions";
import type { SurveyActionError } from "@/lib/surveys/errors";

const FormSchema = z.object({ title: SurveyTitleSchema });
type FormValues = z.infer<typeof FormSchema>;

/**
 * DESIGN.md §5: rename is a `Dialog` with one `Input`.
 *
 * Renaming goes through `updateSurveyDefinition`, so it bumps the version and,
 * on a live survey, republishes the snapshot — the respondent sees the new
 * title. That is intended: the title is part of the definition, not metadata
 * about it. Question *keys* are what must not move (docs/DECISIONS.md 003).
 */
export function RenameSurveyDialog({
    surveyId,
    currentTitle,
    open,
    onOpenChange
}: {
    readonly surveyId: SurveyId;
    readonly currentTitle: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("Surveys.rename");
    const tCommon = useTranslations("Common");

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<SurveyActionError | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: { title: currentTitle }
    });

    function close() {
        form.reset({ title: currentTitle });
        setError(null);
        onOpenChange(false);
    }

    function onSubmit(values: FormValues) {
        setError(null);
        startTransition(async () => {
            const result = await renameSurveyAction({
                surveyId,
                title: values.title
            });
            if (result.ok) onOpenChange(false);
            else setError(result.error);
        });
    }

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
                    <DialogDescription className="text-xs leading-[1.35]">
                        {t("body")}
                    </DialogDescription>
                </DialogHeader>

                <form
                    noValidate
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="grid gap-2.5"
                >
                    <div className="grid gap-1.5">
                        <Label
                            htmlFor={`rename-${surveyId}`}
                            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
                        >
                            {t("titleLabel")}
                        </Label>
                        <Input
                            id={`rename-${surveyId}`}
                            autoFocus
                            autoComplete="off"
                            aria-invalid={
                                form.formState.errors.title !== undefined
                            }
                            className="h-[30px] rounded text-xs"
                            {...form.register("title")}
                        />
                    </div>

                    <ActionError error={error} />

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
