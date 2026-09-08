"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { hasLocale, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { SurveyTitleSchema } from "@/domain/survey";
import { DEFAULT_LOCALE, UI_LOCALES } from "@/lib/i18n/locales";
import { ROUTES } from "@/lib/routes";
import { createSurveyAction } from "@/lib/surveys/actions";
import type { SurveyActionError } from "@/lib/surveys/errors";

/**
 * The schema is the domain's, not a copy of it: the same rule decides what the
 * form rejects and what the action accepts. Client validation is a UX nicety —
 * `createSurveyAction` re-parses this server-side regardless, because a Server
 * Action is a public POST endpoint.
 *
 * A successful create navigates to the new survey's builder rather than back
 * to the list: creating a survey is the first half of an action whose second
 * half is writing its questions.
 */
const FormSchema = z.object({
    title: SurveyTitleSchema,
    locale: z.literal(UI_LOCALES)
});
type FormValues = z.infer<typeof FormSchema>;

export function CreateSurveyDialog({
    open,
    onOpenChange
}: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("Surveys.create");
    const tCommon = useTranslations("Common");
    const tLanguage = useTranslations("Language");
    const uiLocale = useLocale();
    const router = useRouter();

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<SurveyActionError | null>(null);

    // A survey's language is usually its author's, and the author can say
    // otherwise: it is a property of the survey, not of whoever is reading the
    // dashboard, because the runner renders in it (docs/DECISIONS.md 011).
    const defaultLocale = hasLocale(UI_LOCALES, uiLocale)
        ? uiLocale
        : DEFAULT_LOCALE;

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: { title: "", locale: defaultLocale }
    });

    /**
     * Everything is reset on the way *out* rather than on the way in, so the
     * dialog is already clean the next time the parent opens it. Resetting on
     * open would mean setting state from an effect, which this codebase does
     * not do.
     */
    function close() {
        form.reset({ title: "", locale: defaultLocale });
        setError(null);
        onOpenChange(false);
    }

    function onSubmit(values: FormValues) {
        setError(null);
        startTransition(async () => {
            const result = await createSurveyAction(values);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            // Straight into the builder. The dialog says questions come next,
            // and returning to a list where the only thing to do is find the
            // row just created and click it made a liar of it.
            close();
            router.push(ROUTES.builder(result.data.surveyId));
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
                            htmlFor="create-survey-title"
                            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
                        >
                            {t("titleLabel")}
                        </Label>
                        <Input
                            id="create-survey-title"
                            autoFocus
                            autoComplete="off"
                            placeholder={t("titlePlaceholder")}
                            aria-invalid={
                                form.formState.errors.title !== undefined
                            }
                            className="h-[30px] rounded text-xs"
                            {...form.register("title")}
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label
                            htmlFor="create-survey-locale"
                            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
                        >
                            {t("localeLabel")}
                        </Label>
                        {/* `Controller` rather than `watch()`: the latter
                            returns a function React Compiler cannot memoize,
                            so it opts the whole component out of compilation. */}
                        <Controller
                            control={form.control}
                            name="locale"
                            render={({ field }) => (
                                <Select
                                    value={field.value}
                                    onValueChange={value => {
                                        if (hasLocale(UI_LOCALES, value)) {
                                            field.onChange(value);
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        id="create-survey-locale"
                                        onBlur={field.onBlur}
                                        className="h-[30px]! rounded text-xs"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded">
                                        {UI_LOCALES.map(option => (
                                            <SelectItem
                                                key={option}
                                                value={option}
                                                className="rounded text-xs"
                                            >
                                                {tLanguage(`name.${option}`)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        <p className="text-[11px] leading-[1.35] text-muted-foreground">
                            {t("localeHelp")}
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
