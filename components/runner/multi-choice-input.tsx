"use client";

import { useTranslations } from "next-intl";

import type { AnswerValueFor } from "@/domain/answer";
import { OTHER_OPTION_VALUE } from "@/domain/question";
import type { MultiChoiceQuestion } from "@/domain/question";
import { OptionRow, OtherField } from "@/components/runner/option-row";
import type { InputProps } from "@/components/runner/input-props";

type Answer = AnswerValueFor<"multi_choice">;

/**
 * Several answers within the question's bounds. The bounds are not enforced by
 * disabling options once the maximum is reached — a respondent who wants a
 * different third choice would then have to work out which of their existing
 * two to give up, from a row that has silently stopped responding. They are
 * reported instead, by `validateAnswer`, in words.
 */
export function MultiChoiceInput({
    question,
    value,
    labelledBy,
    describedBy,
    // `invalid` is deliberately not destructured: ARIA does not support
    // aria-invalid on role="group", and the problem message this group already
    // points at with aria-describedby is what conveys the state instead.
    onChange
}: InputProps<MultiChoiceQuestion, Answer>) {
    const t = useTranslations("RunnerQuestion");
    const chosen = value?.values ?? [];
    const wroteOther = chosen.includes(OTHER_OPTION_VALUE);

    /** Keeps the selection in the question's own option order, not click order. */
    const order = [
        ...question.options.map(option => option.value),
        OTHER_OPTION_VALUE
    ];

    const toggle = (option: string, checked: boolean) => {
        const next = order.filter(candidate =>
            candidate === option ? checked : chosen.includes(candidate)
        );
        if (next.length === 0) {
            onChange(null);
            return;
        }
        const other = next.includes(OTHER_OPTION_VALUE)
            ? (value?.other ?? "")
            : undefined;
        onChange({
            type: "multi_choice",
            values: next,
            ...(other !== undefined && { other })
        });
    };

    return (
        <div
            role="group"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="flex flex-col gap-2"
        >
            {question.options.map(option => (
                <OptionRow
                    key={option.value}
                    type="checkbox"
                    name={`${question.id}-${option.value}`}
                    value={option.value}
                    checked={chosen.includes(option.value)}
                    label={option.label}
                    onSelect={checked => toggle(option.value, checked)}
                />
            ))}

            {question.allowOther && question.otherLabel !== undefined && (
                <>
                    <OptionRow
                        type="checkbox"
                        name={`${question.id}-other`}
                        value={OTHER_OPTION_VALUE}
                        checked={wroteOther}
                        label={question.otherLabel}
                        onSelect={checked =>
                            toggle(OTHER_OPTION_VALUE, checked)
                        }
                    />
                    {wroteOther && (
                        <OtherField
                            id={`${question.id}-other-text`}
                            label={question.otherLabel}
                            placeholder={t("otherPlaceholder")}
                            value={value?.other ?? ""}
                            onChange={other =>
                                onChange({
                                    type: "multi_choice",
                                    values: chosen,
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
