"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Field, ToggleRow } from "@/components/builder/field";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    QuestionKeySchema,
    type AnswerableQuestion,
    type MultiChoiceQuestion,
    type SingleChoiceQuestion,
    type SurveyElement
} from "@/domain/question";
import {
    withDescription,
    withOther,
    withOtherLabel
} from "@/lib/builder/element-patch";
import { nextKeyFor, type KeyPolicy } from "@/lib/builder/keys";
import { takenKeys } from "@/lib/builder/new-element";

/**
 * The fields every element has: its title, its help text, its key, and — for
 * the eight answerable types — whether an answer is required.
 *
 * Each editor composes these rather than repeating them, so that a change to
 * how a title behaves lands in one place. Every keystroke produces a whole new
 * element and hands it to the builder, which applies it and lets the autosave
 * follow; there is no form state of its own and therefore nothing that can
 * drift out of step with the document.
 */

/** Ids are namespaced by element, so a switched selection cannot collide. */
export function fieldId(element: SurveyElement, field: string): string {
    return `element-${element.id}-${field}`;
}

/** A bordered group with the Label-level heading DESIGN §4 asks for. */
export function EditorSection({
    label,
    children
}: {
    readonly label: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 border-t pt-3">
            <span className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                {label}
            </span>
            {children}
        </div>
    );
}

/**
 * The question key.
 *
 * PLAN Phase 1 asks for three things at once: derive the key from the title,
 * let the owner override it, and warn loudly before a rename on a published
 * survey. So the chip DESIGN §5 specifies gains an edit button, and under
 * `freeze` — answers exist against this key, or a sibling wave lines up
 * against it — that button goes through an `AlertDialog` first. The rename is
 * never *refused*: an owner who has read the warning may still have a good
 * reason. See docs/DECISIONS.md 015.
 */
function KeyField({
    element,
    siblings,
    keyPolicy,
    onChange
}: {
    readonly element: SurveyElement;
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const tErrors = useTranslations("Builder.errors");
    const [editing, setEditing] = useState(false);
    const [warning, setWarning] = useState(false);

    const id = fieldId(element, "key");
    const taken = new Set(takenKeys(siblings, element));

    const error = !QuestionKeySchema.safeParse(element.key).success
        ? tErrors("keyInvalid")
        : taken.has(element.key)
          ? tErrors("keyTaken")
          : undefined;

    const edit = () => {
        setWarning(false);
        setEditing(true);
    };

    return (
        <Field
            id={id}
            label={t("keyLabel")}
            help={t(
                keyPolicy === "derive" ? "keyHelp.derive" : "keyHelp.freeze"
            )}
            {...(error !== undefined && { error })}
        >
            {editing ? (
                <Input
                    id={id}
                    autoFocus
                    value={element.key}
                    placeholder={t("keyPlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error !== undefined}
                    {...(error !== undefined && {
                        "aria-describedby": `${id}-error`
                    })}
                    onChange={event =>
                        onChange({ ...element, key: event.currentTarget.value })
                    }
                    onBlur={() => {
                        if (error === undefined) setEditing(false);
                    }}
                    className="h-[30px] rounded font-mono text-[11px]"
                />
            ) : (
                <div id={id} className="flex items-center gap-1">
                    <Badge
                        variant="secondary"
                        className="h-[22px] rounded px-1.5 font-mono text-[11px] leading-none font-normal"
                    >
                        {element.key}
                    </Badge>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editKey")}
                        onClick={() =>
                            keyPolicy === "freeze" ? setWarning(true) : edit()
                        }
                        className="rounded text-muted-foreground"
                    >
                        <Pencil aria-hidden />
                    </Button>
                </div>
            )}

            <AlertDialog open={warning} onOpenChange={setWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("keyWarning.title")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("keyWarning.body", { key: element.key })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t("keyWarning.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={edit}>
                            {t("keyWarning.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Field>
    );
}

export function ElementFields({
    element,
    siblings,
    keyPolicy,
    onChange,
    titleLabel,
    titlePlaceholder
}: {
    readonly element: SurveyElement;
    /** Every element in the survey, so a derived key can dodge the taken ones. */
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
    /** A statement is shown rather than asked, so it labels its text field
     *  differently from the eight question types. */
    readonly titleLabel: string;
    readonly titlePlaceholder: string;
}) {
    const t = useTranslations("Builder.editor");
    const tErrors = useTranslations("Builder.errors");

    const titleError =
        element.title.trim() === "" ? tErrors("titleRequired") : undefined;

    return (
        <>
            <Field
                id={fieldId(element, "title")}
                label={titleLabel}
                {...(titleError !== undefined && { error: titleError })}
            >
                <Input
                    id={fieldId(element, "title")}
                    value={element.title}
                    placeholder={titlePlaceholder}
                    autoComplete="off"
                    aria-invalid={titleError !== undefined}
                    {...(titleError !== undefined && {
                        "aria-describedby": `${fieldId(element, "title")}-error`
                    })}
                    onChange={event => {
                        const title = event.currentTarget.value;
                        onChange({
                            ...element,
                            title,
                            key: nextKeyFor(element, title, siblings, keyPolicy)
                        });
                    }}
                    className="h-[30px] rounded text-xs"
                />
            </Field>

            <Field
                id={fieldId(element, "description")}
                label={t("descriptionLabel")}
            >
                <Textarea
                    id={fieldId(element, "description")}
                    value={element.description ?? ""}
                    placeholder={t("descriptionPlaceholder")}
                    rows={2}
                    onChange={event =>
                        onChange(
                            withDescription(element, event.currentTarget.value)
                        )
                    }
                    className="min-h-14 rounded py-1.5 text-xs"
                />
            </Field>

            <KeyField
                element={element}
                siblings={siblings}
                keyPolicy={keyPolicy}
                onChange={onChange}
            />
        </>
    );
}

/** The one toggle every answerable question has. */
export function RequiredToggle({
    question,
    onChange
}: {
    readonly question: AnswerableQuestion;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const id = fieldId(question, "required");

    return (
        <ToggleRow
            id={id}
            label={t("requiredLabel")}
            control={
                <Switch
                    id={id}
                    checked={question.required}
                    onCheckedChange={required =>
                        onChange({ ...question, required })
                    }
                />
            }
        />
    );
}

/** The toggle group at the foot of an editor; unlabelled, unlike a section. */
export function ToggleSection({ children }: { readonly children: ReactNode }) {
    return <div className="flex flex-col gap-1 border-t pt-3">{children}</div>;
}

/**
 * "Allow a written answer", and the label that goes with it.
 *
 * Shared by the two choice questions that offer it. `SurveyElementSchema`
 * requires a label whenever the toggle is on, so the field appears with it and
 * an emptied label is an error the panel names rather than a save it rejects.
 */
export function OtherToggle({
    question,
    onChange
}: {
    readonly question: SingleChoiceQuestion | MultiChoiceQuestion;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const tErrors = useTranslations("Builder.errors");

    const error =
        question.allowOther && (question.otherLabel ?? "").trim() === ""
            ? tErrors("otherLabelRequired")
            : undefined;

    return (
        <>
            <ToggleRow
                id={fieldId(question, "allow-other")}
                label={t("allowOtherLabel")}
                control={
                    <Switch
                        id={fieldId(question, "allow-other")}
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
                    id={fieldId(question, "other-label")}
                    label={t("otherLabelLabel")}
                    {...(error !== undefined && { error })}
                >
                    <Input
                        id={fieldId(question, "other-label")}
                        value={question.otherLabel ?? ""}
                        placeholder={t("otherLabelPlaceholder")}
                        autoComplete="off"
                        aria-invalid={error !== undefined}
                        {...(error !== undefined && {
                            "aria-describedby": `${fieldId(question, "other-label")}-error`
                        })}
                        onChange={event =>
                            onChange(
                                withOtherLabel(
                                    question,
                                    event.currentTarget.value
                                )
                            )
                        }
                        className="h-[30px] rounded text-xs"
                    />
                </Field>
            )}
        </>
    );
}
