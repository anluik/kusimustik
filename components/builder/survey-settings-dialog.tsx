"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { hasLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ToggleRow } from "@/components/builder/field";
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
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { orderLocales } from "@/domain/content";
import type { SurveyLocale } from "@/domain/content";
import type { SurveyId } from "@/domain/ids";
import { SurveyLocalesSchema, WaveLabelSchema } from "@/domain/survey";
import { UI_LOCALES } from "@/lib/i18n/locales";
import { saveSurveySettingsAction } from "@/lib/surveys/actions";
import type { SurveyActionError } from "@/lib/surveys/errors";

/**
 * The settings that belong to the survey rather than to anything it says: the
 * language it is written in, the languages it is offered in, and which wave of
 * its group it is.
 *
 * Its title and the paragraph above the first question used to be here. They
 * are content, not settings — a respondent reads both — so they are the header
 * block at the top of the element list now, and they translate and autosave
 * with the rest of the document (docs/DECISIONS.md 034). Keeping them here
 * would have meant a second language switcher, inside a dialog that covers the
 * one in the app bar.
 *
 * A dialog with an explicit submit rather than the panel's keystroke-by-
 * keystroke autosave, because the language set changes what the public link
 * offers — and because the save bumps the version, which the builder has to be
 * handed back rather than discover as a conflict.
 *
 * The schemas are the domain's, not copies: the same rules decide what this
 * form rejects and what the action accepts. An empty wave label is *no* label,
 * which is why it is optional here and null on the wire.
 *
 * The two language fields are one decision seen from two sides, so the form
 * keeps them consistent rather than validating them against each other after
 * the fact: the authoring language is always among the offered ones, and it
 * cannot be switched off. Adding a language here is what makes the builder's
 * switcher appear; nothing is translated by it, and every field falls back
 * until the author writes one. See docs/DECISIONS.md 031.
 */
const FormSchema = z.object({
    locale: z.literal(UI_LOCALES),
    locales: SurveyLocalesSchema,
    waveLabel: z.union([WaveLabelSchema, z.literal("")])
});
type FormValues = z.infer<typeof FormSchema>;

export type SurveySettings = {
    readonly locale: FormValues["locale"];
    /** Canonically ordered, and always containing `locale`. */
    readonly locales: readonly SurveyLocale[];
    readonly waveLabel: string | undefined;
};

export function SurveySettingsDialog({
    surveyId,
    settings,
    version,
    open,
    onOpenChange,
    onSaved
}: {
    readonly surveyId: SurveyId;
    readonly settings: SurveySettings;
    /** The version the builder last saw; the save carries it and returns the
     *  new one so the autosave keeps its optimistic-concurrency token. */
    readonly version: number;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onSaved: (settings: SurveySettings, version: number) => void;
}) {
    const t = useTranslations("Builder.settings");
    const tCommon = useTranslations("Common");
    const tLanguage = useTranslations("Language");

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<SurveyActionError | null>(null);

    const current: FormValues = {
        locale: settings.locale,
        locales: [...settings.locales],
        waveLabel: settings.waveLabel ?? ""
    };

    const form = useForm<FormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: current
    });

    /**
     * Reset on the way *out* rather than on the way in, so the dialog is
     * already showing what the survey says the next time it opens. Resetting
     * on open would mean setting state from an effect, which this codebase
     * does not do.
     */
    function close() {
        form.reset(current);
        setError(null);
        onOpenChange(false);
    }

    function onSubmit(values: FormValues) {
        setError(null);
        const waveLabel = values.waveLabel === "" ? null : values.waveLabel;

        startTransition(async () => {
            const result = await saveSurveySettingsAction({
                surveyId,
                expectedVersion: version,
                locale: values.locale,
                locales: [...values.locales],
                waveLabel
            });

            if (!result.ok) {
                setError(result.error);
                return;
            }

            onSaved(
                {
                    locale: values.locale,
                    locales: values.locales,
                    waveLabel: waveLabel ?? undefined
                },
                result.data.version
            );
            form.reset(values);
            setError(null);
            onOpenChange(false);
        });
    }

    const label = (htmlFor: string, text: string) => (
        <Label
            htmlFor={htmlFor}
            className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
        >
            {text}
        </Label>
    );

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
                    {/* `Controller` rather than `watch()`: the latter returns
                        a function React Compiler cannot memoize, so it opts
                        the whole component out of compilation. One controller
                        for both fields, because they are one decision: which
                        language the survey is written in decides which switch
                        below it cannot be turned off. */}
                    <Controller
                        control={form.control}
                        name="locale"
                        render={({ field: source }) => (
                            <>
                                <div className="grid gap-1.5">
                                    {label(
                                        "survey-settings-locale",
                                        t("localeLabel")
                                    )}
                                    <Select
                                        value={source.value}
                                        onValueChange={value => {
                                            if (!hasLocale(UI_LOCALES, value)) {
                                                return;
                                            }
                                            source.onChange(value);
                                            // A survey is always offered in
                                            // the language it is written in,
                                            // so switching that adds it rather
                                            // than leaving behind a set the
                                            // schema rejects.
                                            form.setValue(
                                                "locales",
                                                [
                                                    ...orderLocales([
                                                        ...form.getValues(
                                                            "locales"
                                                        ),
                                                        value
                                                    ])
                                                ],
                                                { shouldDirty: true }
                                            );
                                        }}
                                    >
                                        <SelectTrigger
                                            id="survey-settings-locale"
                                            onBlur={source.onBlur}
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
                                                    {tLanguage(
                                                        `name.${option}`
                                                    )}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] leading-[1.35] text-muted-foreground">
                                        {t("localeHelp")}
                                    </p>
                                </div>

                                <div className="grid gap-1.5">
                                    {label(
                                        "survey-settings-locales",
                                        t("localesLabel")
                                    )}
                                    <Controller
                                        control={form.control}
                                        name="locales"
                                        render={({ field }) => (
                                            <div
                                                id="survey-settings-locales"
                                                className="flex flex-col gap-1"
                                            >
                                                {UI_LOCALES.map(option => (
                                                    <ToggleRow
                                                        key={option}
                                                        id={`survey-settings-locales-${option}`}
                                                        label={tLanguage(
                                                            `name.${option}`
                                                        )}
                                                        control={
                                                            <Switch
                                                                id={`survey-settings-locales-${option}`}
                                                                checked={field.value.includes(
                                                                    option
                                                                )}
                                                                // The
                                                                // authoring
                                                                // language is
                                                                // not
                                                                // optional.
                                                                // DESIGN §6:
                                                                // the control
                                                                // stays and
                                                                // goes quiet
                                                                // rather than
                                                                // disappearing.
                                                                disabled={
                                                                    option ===
                                                                    source.value
                                                                }
                                                                onCheckedChange={on =>
                                                                    field.onChange(
                                                                        [
                                                                            ...orderLocales(
                                                                                on
                                                                                    ? [
                                                                                          ...field.value,
                                                                                          option
                                                                                      ]
                                                                                    : field.value.filter(
                                                                                          locale =>
                                                                                              locale !==
                                                                                              option
                                                                                      )
                                                                            )
                                                                        ]
                                                                    )
                                                                }
                                                            />
                                                        }
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    />
                                    <p className="text-[11px] leading-[1.35] text-muted-foreground">
                                        {t("localesHelp")}
                                    </p>
                                </div>
                            </>
                        )}
                    />

                    <div className="grid gap-1.5">
                        {label("survey-settings-wave", t("waveLabel"))}
                        <Input
                            id="survey-settings-wave"
                            autoComplete="off"
                            placeholder={t("wavePlaceholder")}
                            aria-invalid={
                                form.formState.errors.waveLabel !== undefined
                            }
                            className="h-[30px] rounded text-xs"
                            {...form.register("waveLabel")}
                        />
                        <p className="text-[11px] leading-[1.35] text-muted-foreground">
                            {t("waveHelp")}
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
