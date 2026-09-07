"use client";

import { useTranslations } from "next-intl";

import type { AnswerValueFor } from "@/domain/answer";
import type { LongTextQuestion, ShortTextQuestion } from "@/domain/question";
import type { InputProps } from "@/components/runner/input-props";
import { cn } from "@/lib/utils";

/**
 * Short and long text share one component. They differ in a line count and a
 * default limit and in nothing a respondent can tell apart, which is the test
 * docs/DECISIONS.md 015 applies to the editors: separate components are for
 * types that *offer* different things.
 *
 * `maxLength` is not set on the element. A hard limit silently swallows
 * keystrokes at the boundary, which reads as a broken keyboard; the counter
 * turns destructive instead and `validateAnswer` says how many characters are
 * allowed.
 */

const FIELD =
    "w-full rounded-survey border border-input bg-survey-card px-3 py-2.5 text-[14px] leading-[1.35] outline-none focus-visible:border-survey-primary focus-visible:ring-[3px] focus-visible:ring-ring/18";

export function ShortTextInput(
    props: InputProps<ShortTextQuestion, AnswerValueFor<"short_text">>
) {
    return (
        <TextField
            {...props}
            rows={1}
            fallbackLimit={1_000}
            wrap={(value): AnswerValueFor<"short_text"> => ({
                type: "short_text",
                value
            })}
        />
    );
}

export function LongTextInput(
    props: InputProps<LongTextQuestion, AnswerValueFor<"long_text">>
) {
    return (
        <TextField
            {...props}
            rows={4}
            fallbackLimit={10_000}
            wrap={(value): AnswerValueFor<"long_text"> => ({
                type: "long_text",
                value
            })}
        />
    );
}

function TextField<
    TQuestion extends ShortTextQuestion | LongTextQuestion,
    TAnswer extends AnswerValueFor<"short_text" | "long_text">
>({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange,
    rows,
    fallbackLimit,
    wrap
}: InputProps<TQuestion, TAnswer> & {
    readonly rows: number;
    readonly fallbackLimit: number;
    readonly wrap: (value: string) => TAnswer;
}) {
    const t = useTranslations("RunnerQuestion");
    const text = value?.value ?? "";
    const limit = question.maxLength;

    const change = (next: string) => {
        // An emptied field is a skipped question, not an empty answer.
        onChange(next.trim() === "" ? null : wrap(next));
    };

    const shared = {
        "aria-labelledby": labelledBy,
        "aria-describedby": describedBy,
        "aria-invalid": invalid,
        value: text,
        // The schema's own ceiling, so a paste cannot grow without bound; the
        // question's own limit is reported rather than enforced.
        maxLength: fallbackLimit,
        onChange: (event: { target: { value: string } }) =>
            change(event.target.value),
        ...(question.placeholder !== undefined && {
            placeholder: question.placeholder
        })
    };

    return (
        <div className="flex flex-col gap-1.5">
            {rows === 1 ? (
                <input
                    type="text"
                    {...shared}
                    className={cn(FIELD, "min-h-12")}
                />
            ) : (
                <textarea
                    {...shared}
                    rows={rows}
                    className={cn(FIELD, "resize-y")}
                />
            )}
            {limit !== undefined && (
                <span
                    className={cn(
                        "self-end font-mono text-[11px] leading-none tabular-nums",
                        text.length > limit
                            ? "text-destructive"
                            : "text-muted-foreground"
                    )}
                >
                    {t("characters", { count: text.length, max: limit })}
                </span>
            )}
        </div>
    );
}
