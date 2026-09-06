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
import { WaveLabelSchema } from "@/domain/survey";
import { duplicateSurveyAction } from "@/lib/surveys/actions";
import type { SurveyActionError } from "@/lib/surveys/errors";

/** An empty box means "no label", which is a legitimate answer, not an error. */
const FormSchema = z.object({
    waveLabel: z.union([WaveLabelSchema, z.literal("")])
});
type FormValues = z.infer<typeof FormSchema>;

/**
 * Duplicating a survey is how a recurring one gets its next wave: the copy
 * keeps the source's `waveGroupId` and every question `key` and is given fresh
 * ids, so next year's results still line up with this year's
 * (docs/DECISIONS.md 003). The label is what the comparison charts will use as
 * the series name, which is why it is asked for here rather than buried in
 * settings.
 */
export function DuplicateSurveyDialog({
    surveyId,
    isWave,
    open,
    onOpenChange
}: {
    readonly surveyId: SurveyId;
    /** Changes only the heading: "new wave" for a series, "duplicate" for one. */
    readonly isWave: boolean;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("Surveys.duplicate");
    const tCommon = useTranslations("Common");

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<SurveyActionError | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: { waveLabel: "" }
    });

    function close() {
        form.reset({ waveLabel: "" });
        setError(null);
        onOpenChange(false);
    }

    function onSubmit(values: FormValues) {
        setError(null);
        startTransition(async () => {
            const result = await duplicateSurveyAction({
                surveyId,
                waveLabel: values.waveLabel === "" ? null : values.waveLabel
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
                        {isWave ? t("titleWave") : t("title")}
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
                            htmlFor={`duplicate-${surveyId}`}
                            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
                        >
                            {t("waveLabelLabel")}
                        </Label>
                        <Input
                            id={`duplicate-${surveyId}`}
                            autoFocus
                            autoComplete="off"
                            placeholder={t("waveLabelPlaceholder")}
                            aria-invalid={
                                form.formState.errors.waveLabel !== undefined
                            }
                            className="h-[30px] rounded text-xs"
                            {...form.register("waveLabel")}
                        />
                        <p className="text-[11px] leading-[1.35] text-muted-foreground">
                            {t("waveLabelHelp")}
                        </p>
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
