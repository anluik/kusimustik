"use client";

import { useTranslations } from "next-intl";

import {
    EditorSection,
    ElementFields,
    RequiredToggle,
    ToggleSection,
    fieldId
} from "@/components/builder/element-fields";
import { Field } from "@/components/builder/field";
import { Input } from "@/components/ui/input";
import type {
    LongTextQuestion,
    ShortTextQuestion,
    SurveyElement
} from "@/domain/question";
import {
    readOptionalNumber,
    withMaxLength,
    withPlaceholder
} from "@/lib/builder/element-patch";
import type { SurveyKeys } from "@/lib/builder/keys";

/**
 * The two written-answer questions. They differ only in what the runner draws
 * — one line or a textarea — and in how long an answer the schema will take,
 * so they share an editor and pass their own ceiling in.
 */

type TextQuestion = ShortTextQuestion | LongTextQuestion;

function TextFields({
    question,
    siblings,
    keys,
    onChange,
    maxLengthCeiling
}: {
    readonly question: TextQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keys: SurveyKeys;
    readonly onChange: (element: SurveyElement) => void;
    /** `ShortTextQuestionSchema` stops at 1 000 characters, long text at 10 000. */
    readonly maxLengthCeiling: number;
}) {
    const t = useTranslations("Builder.editor");

    return (
        <>
            <ElementFields
                element={question}
                siblings={siblings}
                keys={keys}
                onChange={onChange}
                titleLabel={t("titleLabel")}
                titlePlaceholder={t("titlePlaceholder")}
            />

            <EditorSection label={t("answerLabel")}>
                <Field
                    id={fieldId(question, "placeholder")}
                    label={t("placeholderLabel")}
                >
                    <Input
                        id={fieldId(question, "placeholder")}
                        value={question.placeholder ?? ""}
                        placeholder={t("placeholderPlaceholder")}
                        autoComplete="off"
                        onChange={event =>
                            onChange(
                                withPlaceholder(
                                    question,
                                    event.currentTarget.value
                                )
                            )
                        }
                        className="h-[30px] rounded text-xs"
                    />
                </Field>

                <Field
                    id={fieldId(question, "max-length")}
                    label={t("maxLengthLabel")}
                    help={t("maxLengthHelp", { max: maxLengthCeiling })}
                >
                    <Input
                        id={fieldId(question, "max-length")}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={maxLengthCeiling}
                        value={question.maxLength ?? ""}
                        placeholder={t("maxLengthPlaceholder")}
                        onChange={event => {
                            const value = readOptionalNumber(
                                event.currentTarget.value
                            );
                            onChange(
                                withMaxLength(
                                    question,
                                    value === undefined
                                        ? undefined
                                        : Math.min(
                                              Math.max(value, 1),
                                              maxLengthCeiling
                                          )
                                )
                            );
                        }}
                        className="h-[30px] rounded text-xs"
                    />
                </Field>
            </EditorSection>

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}

export function ShortTextEditor(props: {
    readonly question: ShortTextQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keys: SurveyKeys;
    readonly onChange: (element: SurveyElement) => void;
}) {
    return <TextFields {...props} maxLengthCeiling={1_000} />;
}

export function LongTextEditor(props: {
    readonly question: LongTextQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keys: SurveyKeys;
    readonly onChange: (element: SurveyElement) => void;
}) {
    return <TextFields {...props} maxLengthCeiling={10_000} />;
}
