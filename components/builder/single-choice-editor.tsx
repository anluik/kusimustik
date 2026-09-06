"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Field, ToggleRow } from "@/components/builder/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
    ChoiceOption,
    SingleChoiceQuestion,
    SurveyElement
} from "@/domain/question";
import { nextKeyFor, type KeyPolicy } from "@/lib/builder/keys";
import { newOption } from "@/lib/builder/new-element";

/**
 * The editor for a single-choice question.
 *
 * Every keystroke produces a whole new question object and hands it to the
 * builder, which applies it and lets the autosave follow. There is no form
 * state of its own and therefore nothing that can drift out of step with the
 * document — react-hook-form earns its keep on a dialog that submits once, not
 * on a panel whose every change is already the save.
 *
 * The two options the schema requires are a floor the remove button respects,
 * and option *values* are never touched here: an answer stores the value, so
 * rewording an option must leave the answers already given to it alone.
 */

/**
 * An emptied optional field is *absent*, not present-and-undefined: the
 * document is stored as JSONB and read back through `SurveyElementSchema`, and
 * `exactOptionalPropertyTypes` makes the difference a type error rather than a
 * detail. Hence `delete` on a copy instead of a spread with `undefined`.
 */
function withDescription(
    question: SingleChoiceQuestion,
    value: string
): SingleChoiceQuestion {
    const next: SingleChoiceQuestion = { ...question };
    if (value.trim() === "") delete next.description;
    else next.description = value;
    return next;
}

/** The schema requires a label whenever "other" is offered, so one is kept. */
function withOther(
    question: SingleChoiceQuestion,
    allowOther: boolean,
    defaultLabel: string
): SingleChoiceQuestion {
    const next: SingleChoiceQuestion = { ...question, allowOther };
    if (allowOther) next.otherLabel = question.otherLabel ?? defaultLabel;
    else delete next.otherLabel;
    return next;
}

export function SingleChoiceEditor({
    question,
    siblings,
    keyPolicy,
    onChange
}: {
    readonly question: SingleChoiceQuestion;
    /** Every element in the survey, so a derived key can dodge the taken ones. */
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const tErrors = useTranslations("Builder.errors");

    const id = (field: string) => `element-${question.id}-${field}`;

    const setOptions = (options: readonly ChoiceOption[]) =>
        onChange({ ...question, options: [...options] });

    const replaceOption = (index: number, label: string) =>
        setOptions(
            question.options.map((option, position) =>
                position === index ? { ...option, label } : option
            )
        );

    const titleError =
        question.title.trim() === "" ? tErrors("titleRequired") : undefined;
    const otherLabelError =
        question.allowOther && (question.otherLabel ?? "").trim() === ""
            ? tErrors("otherLabelRequired")
            : undefined;

    return (
        <div className="flex flex-col gap-3.5">
            <Field
                id={id("title")}
                label={t("titleLabel")}
                {...(titleError !== undefined && { error: titleError })}
            >
                <Input
                    id={id("title")}
                    value={question.title}
                    placeholder={t("titlePlaceholder")}
                    autoComplete="off"
                    aria-invalid={titleError !== undefined}
                    {...(titleError !== undefined && {
                        "aria-describedby": `${id("title")}-error`
                    })}
                    onChange={event => {
                        const title = event.currentTarget.value;
                        onChange({
                            ...question,
                            title,
                            key: nextKeyFor(
                                question,
                                title,
                                siblings,
                                keyPolicy
                            )
                        });
                    }}
                    className="h-[30px] rounded text-xs"
                />
            </Field>

            <Field id={id("description")} label={t("descriptionLabel")}>
                <Textarea
                    id={id("description")}
                    value={question.description ?? ""}
                    placeholder={t("descriptionPlaceholder")}
                    rows={2}
                    onChange={event =>
                        onChange(
                            withDescription(question, event.currentTarget.value)
                        )
                    }
                    className="min-h-14 rounded py-1.5 text-xs"
                />
            </Field>

            <Field
                id={id("key")}
                label={t("keyLabel")}
                help={t(
                    keyPolicy === "derive" ? "keyHelp.derive" : "keyHelp.freeze"
                )}
            >
                {/* Read-only until there is a key editor: renaming a key on a
                    published survey severs its own trend line, and that needs
                    a warning, not an input. DESIGN §5 puts it in a Mono chip. */}
                <div id={id("key")}>
                    <Badge
                        variant="secondary"
                        className="h-[22px] rounded px-1.5 font-mono text-[11px] leading-none font-normal"
                    >
                        {question.key}
                    </Badge>
                </div>
            </Field>

            <div className="flex flex-col gap-2 border-t pt-3">
                <span className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                    {t("optionsLabel")}
                </span>

                <ul className="flex flex-col gap-1.5">
                    {question.options.map((option, index) => {
                        const error =
                            option.label.trim() === ""
                                ? tErrors("optionRequired")
                                : undefined;

                        return (
                            <li
                                key={option.value}
                                className="flex flex-col gap-1"
                            >
                                <div className="flex items-center gap-1">
                                    <Input
                                        value={option.label}
                                        aria-label={t("optionLabel", {
                                            index: index + 1
                                        })}
                                        placeholder={t("optionPlaceholder")}
                                        autoComplete="off"
                                        aria-invalid={error !== undefined}
                                        onChange={event =>
                                            replaceOption(
                                                index,
                                                event.currentTarget.value
                                            )
                                        }
                                        className="h-[30px] rounded text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        // The schema's floor is two options, so
                                        // the control stays and goes quiet
                                        // rather than disappearing (DESIGN §6).
                                        disabled={question.options.length <= 2}
                                        aria-label={t("removeOption", {
                                            index: index + 1
                                        })}
                                        onClick={() =>
                                            setOptions(
                                                question.options.filter(
                                                    (_, position) =>
                                                        position !== index
                                                )
                                            )
                                        }
                                        className="shrink-0 rounded text-muted-foreground disabled:cursor-not-allowed disabled:text-input disabled:opacity-100"
                                    >
                                        <X aria-hidden />
                                    </Button>
                                </div>
                                {error !== undefined && (
                                    <p className="text-[11px] leading-[1.35] text-destructive">
                                        {error}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        setOptions([
                            ...question.options,
                            newOption(question.options, index =>
                                t("optionLabel", { index })
                            )
                        ])
                    }
                    className="h-[30px] w-full rounded text-xs"
                >
                    <Plus aria-hidden />
                    {t("addOption")}
                </Button>
            </div>

            <div className="flex flex-col gap-1 border-t pt-3">
                <ToggleRow
                    id={id("required")}
                    label={t("requiredLabel")}
                    control={
                        <Switch
                            id={id("required")}
                            checked={question.required}
                            onCheckedChange={required =>
                                onChange({ ...question, required })
                            }
                        />
                    }
                />

                <ToggleRow
                    id={id("allow-other")}
                    label={t("allowOtherLabel")}
                    control={
                        <Switch
                            id={id("allow-other")}
                            checked={question.allowOther}
                            onCheckedChange={allowOther =>
                                onChange(
                                    withOther(
                                        question,
                                        allowOther,
                                        t("otherLabelPlaceholder")
                                    )
                                )
                            }
                        />
                    }
                />

                {question.allowOther && (
                    <Field
                        id={id("other-label")}
                        label={t("otherLabelLabel")}
                        {...(otherLabelError !== undefined && {
                            error: otherLabelError
                        })}
                    >
                        <Input
                            id={id("other-label")}
                            value={question.otherLabel ?? ""}
                            placeholder={t("otherLabelPlaceholder")}
                            autoComplete="off"
                            aria-invalid={otherLabelError !== undefined}
                            {...(otherLabelError !== undefined && {
                                "aria-describedby": `${id("other-label")}-error`
                            })}
                            onChange={event =>
                                onChange({
                                    ...question,
                                    otherLabel: event.currentTarget.value
                                })
                            }
                            className="h-[30px] rounded text-xs"
                        />
                    </Field>
                )}
            </div>
        </div>
    );
}
