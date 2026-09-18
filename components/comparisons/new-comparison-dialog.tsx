"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { useWaveName } from "@/components/comparisons/wave-name";
import { ErrorLine } from "@/components/shell/error-line";
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
    MAX_COMPARED_WAVES,
    MIN_COMPARED_WAVES,
    NewComparisonSchema
} from "@/domain/comparison";
import type { NewComparison } from "@/domain/comparison";
import type { SurveyId, WaveGroupId } from "@/domain/ids";
import { createComparisonAction } from "@/lib/comparisons/actions";
import type { ComparisonActionError } from "@/lib/comparisons/errors";
import type { GroupWave } from "@/lib/comparisons/group";
import { newestWaves } from "@/lib/comparisons/group";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { LABEL, META } from "@/components/type";

/** What the fields hold: plain strings, branded only once parsed. */
type FormInput = z.input<typeof NewComparisonSchema>;

/**
 * A new comparison: a name and the waves it covers (DESIGN §5).
 *
 * The name follows the waves chosen — "2025 – 2027" — until the owner types in
 * it, so the one-click path stays one click. The newest waves the palette can
 * hold start switched on, which is the comparison most owners want. On success
 * the owner lands on the result, where the unconfirmed-matches banner points
 * the way to reviewing what was suggested.
 */
export function NewComparisonDialog({
    waveGroupId,
    group,
    open,
    onOpenChange
}: {
    readonly waveGroupId: WaveGroupId;
    /** Every wave of the group, oldest first. */
    readonly group: readonly GroupWave[];
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("Waves.create");
    const tErrors = useTranslations("Waves.errors");
    const tCommon = useTranslations("Common");
    const waveName = useWaveName();
    const router = useRouter();

    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<ComparisonActionError | null>(null);

    const initialIds = newestWaves(group, MAX_COMPARED_WAVES).map(
        wave => wave.surveyId
    );
    const nameFor = (ids: readonly SurveyId[]): string => {
        const chosen = group.filter(wave => ids.includes(wave.surveyId));
        const first = chosen[0];
        const last = chosen.at(-1);
        if (first === undefined || last === undefined) return "";
        return first === last
            ? waveName(first)
            : `${waveName(first)} – ${waveName(last)}`;
    };
    const defaults = (): FormInput => ({
        name: nameFor(initialIds),
        surveyIds: initialIds
    });

    const form = useForm<FormInput, unknown, NewComparison>({
        resolver: zodResolver(NewComparisonSchema),
        defaultValues: defaults()
    });
    const chosen = useWatch({ control: form.control, name: "surveyIds" });

    function close() {
        form.reset(defaults());
        setError(null);
        onOpenChange(false);
    }

    function toggle(surveyId: SurveyId, on: boolean) {
        // Kept in the group's order, so the default name reads oldest first.
        const next = group
            .map(wave => wave.surveyId)
            .filter(id => (id === surveyId ? on : chosen.includes(id)));
        form.setValue("surveyIds", next, { shouldValidate: true });
        if (!form.getFieldState("name").isDirty) {
            form.setValue("name", nameFor(next));
        }
    }

    function onSubmit(values: NewComparison) {
        setError(null);
        startTransition(async () => {
            const result = await createComparisonAction({
                waveGroupId,
                ...values
            });
            if (!result.ok) {
                setError(result.error);
                return;
            }
            onOpenChange(false);
            router.push(ROUTES.comparison(result.data.comparisonId));
        });
    }

    const countProblem =
        chosen.length < MIN_COMPARED_WAVES
            ? t("tooFew")
            : chosen.length > MAX_COMPARED_WAVES
              ? t("tooMany", { max: MAX_COMPARED_WAVES })
              : null;
    const nameId = `new-comparison-${waveGroupId}`;

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (next) onOpenChange(true);
                else close();
            }}
        >
            <DialogContent className="gap-3 rounded-lg p-3.5 sm:max-w-md">
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
                    className="grid gap-3"
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor={nameId} className={LABEL}>
                            {t("name")}
                        </Label>
                        <Input
                            id={nameId}
                            autoComplete="off"
                            aria-invalid={
                                form.formState.errors.name !== undefined
                            }
                            className="h-[30px] rounded-lg text-xs"
                            {...form.register("name")}
                        />
                    </div>

                    <fieldset className="grid gap-1.5">
                        <legend className={`${LABEL} mb-1.5`}>
                            {t("waves")}
                        </legend>
                        <ul className="flex flex-col divide-y rounded-lg border">
                            {[...group].reverse().map(wave => {
                                const id = `${nameId}-${wave.surveyId}`;
                                return (
                                    <li
                                        key={wave.surveyId}
                                        className="flex h-9 items-center gap-2 px-2.5"
                                    >
                                        <Switch
                                            id={id}
                                            size="sm"
                                            checked={chosen.includes(
                                                wave.surveyId
                                            )}
                                            onCheckedChange={on =>
                                                toggle(wave.surveyId, on)
                                            }
                                        />
                                        <Label
                                            htmlFor={id}
                                            className="min-w-0 flex-1 truncate text-xs font-normal"
                                        >
                                            {waveName(wave)}
                                        </Label>
                                        <span
                                            className={cn(
                                                META,
                                                "text-muted-foreground tabular-nums"
                                            )}
                                        >
                                            {t("responses", {
                                                count: wave.responseCount
                                            })}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        {countProblem !== null && (
                            <p className="text-xs leading-[1.35] text-input">
                                {countProblem}
                            </p>
                        )}
                    </fieldset>

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
                            className="h-[30px] rounded-lg text-xs"
                        >
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={pending || countProblem !== null}
                            className="h-[30px] rounded-lg text-xs"
                        >
                            {t("submit")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
