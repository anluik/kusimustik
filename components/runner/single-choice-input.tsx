"use client";

import { useTranslations } from "next-intl";

import type { AnswerValueFor } from "@/domain/answer";
import { OTHER_OPTION_VALUE } from "@/domain/question";
import type { SingleChoiceQuestion } from "@/domain/question";
import { OptionRow, OtherField } from "@/components/runner/option-row";
import type { InputProps } from "@/components/runner/input-props";

type Answer = AnswerValueFor<"single_choice">;

/**
 * One answer, optionally written. Kept apart from the multi-choice input for
 * the reason docs/DECISIONS.md 015 gives about the editors: the two offer
 * different things — one selection versus bounded several — and a single
 * component branching on `type` internally would be the fallback branch this
 * codebase forbids, one level down.
 */
export function SingleChoiceInput({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange
}: InputProps<SingleChoiceQuestion, Answer>) {
    const t = useTranslations("RunnerQuestion");
    const chosen = value?.value ?? null;

    const select = (next: string) => {
        onChange(
            next === OTHER_OPTION_VALUE
                ? {
                      type: "single_choice",
                      value: OTHER_OPTION_VALUE,
                      other: value?.other ?? ""
                  }
                : { type: "single_choice", value: next }
        );
    };

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="flex flex-col gap-2"
        >
            {question.options.map(option => (
                <OptionRow
                    key={option.value}
                    type="radio"
                    name={question.id}
                    value={option.value}
                    checked={chosen === option.value}
                    label={option.label}
                    onSelect={() => select(option.value)}
                />
            ))}

            {question.allowOther && question.otherLabel !== undefined && (
                <>
                    <OptionRow
                        type="radio"
                        name={question.id}
                        value={OTHER_OPTION_VALUE}
                        checked={chosen === OTHER_OPTION_VALUE}
                        label={question.otherLabel}
                        onSelect={() => select(OTHER_OPTION_VALUE)}
                    />
                    {chosen === OTHER_OPTION_VALUE && (
                        <OtherField
                            id={`${question.id}-other`}
                            label={question.otherLabel}
                            placeholder={t("otherPlaceholder")}
                            value={value?.other ?? ""}
                            onChange={other =>
                                onChange({
                                    type: "single_choice",
                                    value: OTHER_OPTION_VALUE,
                                    other
                                })
                            }
                        />
                    )}
                </>
            )}
        </div>
    );
}
