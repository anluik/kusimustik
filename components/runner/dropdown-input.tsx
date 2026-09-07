"use client";

import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AnswerValueFor } from "@/domain/answer";
import type { DropdownQuestion } from "@/domain/question";
import type { InputProps } from "@/components/runner/input-props";
import { cn } from "@/lib/utils";

type Answer = AnswerValueFor<"dropdown">;

/**
 * A native `<select>`, not the Radix one the builder uses for its type picker.
 * On a phone this opens the operating system's own picker — the control the
 * respondent already knows, scrollable with one thumb, and usable before our
 * JavaScript has arrived. The long option lists this type exists for are
 * exactly where that matters most. See docs/DECISIONS.md 016.
 */
export function DropdownInput({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange
}: InputProps<DropdownQuestion, Answer>) {
    const t = useTranslations("RunnerQuestion");
    const chosen = value?.value ?? "";

    return (
        <div className="relative">
            <select
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={chosen}
                onChange={event =>
                    onChange(
                        event.target.value === ""
                            ? null
                            : { type: "dropdown", value: event.target.value }
                    )
                }
                className={cn(
                    "min-h-12 w-full appearance-none rounded-survey border border-input bg-survey-card py-2 pr-10 pl-3 text-[14px] leading-[1.35] outline-none",
                    "focus-visible:border-survey-primary focus-visible:ring-[3px] focus-visible:ring-ring/18",
                    chosen === "" && "text-muted-foreground"
                )}
            >
                <option value="">{t("dropdownPlaceholder")}</option>
                {question.options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <ChevronsUpDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
        </div>
    );
}
