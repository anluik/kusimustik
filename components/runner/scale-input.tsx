"use client";

import { useTranslations } from "next-intl";

import type { AnswerValueFor } from "@/domain/answer";
import {
    NPS_MAX,
    NPS_MIN,
    OPINION_SCALE_MIN,
    type NpsQuestion,
    type OpinionScaleQuestion
} from "@/domain/question";
import type { InputProps } from "@/components/runner/input-props";
import { cn } from "@/lib/utils";

/**
 * The two ordered scales. Like the text pair, they are one component: an
 * opinion scale and an NPS differ in their bounds and in where their end
 * labels come from, and in nothing the respondent operates differently.
 *
 * The steps are radios, so the browser gives arrow-key movement, the group
 * semantics and a single tab stop for free. They are laid out on an `auto-fit`
 * grid rather than a wrapping flex row because eleven NPS steps do not fit
 * across a phone, and `flex-1` would stretch whatever landed on the last line.
 */

export function OpinionScaleInput({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange
}: InputProps<OpinionScaleQuestion, AnswerValueFor<"opinion_scale">>) {
    return (
        <Scale
            name={question.id}
            min={OPINION_SCALE_MIN}
            max={question.max}
            selected={value?.value ?? null}
            labelledBy={labelledBy}
            describedBy={describedBy}
            invalid={invalid}
            minLabel={question.minLabel}
            maxLabel={question.maxLabel}
            onSelect={step => onChange({ type: "opinion_scale", value: step })}
        />
    );
}

export function NpsInput({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange
}: InputProps<NpsQuestion, AnswerValueFor<"nps">>) {
    const t = useTranslations("RunnerQuestion");

    return (
        <Scale
            name={question.id}
            min={NPS_MIN}
            max={NPS_MAX}
            selected={value?.value ?? null}
            labelledBy={labelledBy}
            describedBy={describedBy}
            invalid={invalid}
            // Fixed by the method, so the wording is ours rather than the
            // author's — and therefore comes from the catalogue.
            minLabel={t("npsMinLabel")}
            maxLabel={t("npsMaxLabel")}
            onSelect={step => onChange({ type: "nps", value: step })}
        />
    );
}

function Scale({
    name,
    min,
    max,
    selected,
    labelledBy,
    describedBy,
    invalid,
    minLabel,
    maxLabel,
    onSelect
}: {
    readonly name: string;
    readonly min: number;
    readonly max: number;
    readonly selected: number | null;
    readonly labelledBy: string;
    readonly describedBy: string | undefined;
    readonly invalid: boolean;
    readonly minLabel: string | undefined;
    readonly maxLabel: string | undefined;
    readonly onSelect: (step: number) => void;
}) {
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
        <div className="flex flex-col gap-2">
            <div
                role="radiogroup"
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="grid gap-1.5"
                style={{
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(2.75rem, 1fr))"
                }}
            >
                {steps.map(step => (
                    <label
                        key={step}
                        className={cn(
                            "relative flex h-12 cursor-pointer items-center justify-center rounded-survey border text-[14px] leading-none tabular-nums transition-colors",
                            "has-[:focus-visible]:border-survey-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/18",
                            selected === step
                                ? "border-[1.5px] border-survey-primary bg-survey-accent font-medium text-survey-accent-foreground"
                                : "border-input hover:bg-muted/60"
                        )}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={step}
                            checked={selected === step}
                            onChange={() => onSelect(step)}
                            className="absolute inset-0 cursor-pointer appearance-none rounded-survey"
                        />
                        {step}
                    </label>
                ))}
            </div>

            {(minLabel !== undefined || maxLabel !== undefined) && (
                <div className="flex justify-between gap-3 text-[11px] leading-[1.35] text-muted-foreground">
                    <span>{minLabel ?? ""}</span>
                    <span className="text-right">{maxLabel ?? ""}</span>
                </div>
            )}
        </div>
    );
}
