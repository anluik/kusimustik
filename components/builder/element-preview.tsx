"use client";

import { useTranslations } from "next-intl";

import { assertNever } from "@/domain/assert-never";
import type { ChoiceOption, SurveyElement } from "@/domain/question";

/**
 * What a respondent will see, at the runner's density (DESIGN.md §4: 6px
 * radius, 13px type, option rows a thumb can hit) rather than the builder's.
 *
 * Nothing here is a real control. The card behind it is the click target that
 * selects the element, and a live radio inside it would compete for the click
 * and for the tab order without answering anything.
 *
 * The switch is exhaustive today: `single_choice` is drawn, the other eight are
 * named one by one in the branch that says so, and `assertNever` fails the
 * build the moment a ninth type joins the union. Adding a type's editor means
 * moving it out of that list. See docs/DECISIONS.md 014.
 */

function OptionRow({
    label,
    shape
}: {
    readonly label: string;
    readonly shape: "radio" | "text";
}) {
    return (
        <div className="flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2">
            {shape === "radio" ? (
                <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full border-[1.5px] border-input"
                />
            ) : (
                <span
                    aria-hidden
                    className="h-4 w-full max-w-40 shrink-0 rounded-[3px] bg-ramp-track"
                />
            )}
            <span className="min-w-0 truncate text-[13px] leading-[1.4]">
                {label}
            </span>
        </div>
    );
}

function ChoicePreview({
    options,
    otherLabel
}: {
    readonly options: readonly ChoiceOption[];
    /** Present only when the question offers a written answer. */
    readonly otherLabel?: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            {options.map(option => (
                <OptionRow
                    key={option.value}
                    label={option.label}
                    shape="radio"
                />
            ))}
            {otherLabel !== undefined && (
                <>
                    <OptionRow label={otherLabel} shape="radio" />
                    <OptionRow label="" shape="text" />
                </>
            )}
        </div>
    );
}

function UnavailablePreview() {
    const t = useTranslations("Builder.preview");

    return (
        <p className="rounded-md border border-dashed px-3 py-2.5 text-xs leading-[1.35] text-muted-foreground">
            {t("unavailable")}
        </p>
    );
}

export function ElementPreview({
    element
}: {
    readonly element: SurveyElement;
}) {
    switch (element.type) {
        case "single_choice":
            return (
                <ChoicePreview
                    options={element.options}
                    {...(element.allowOther &&
                        element.otherLabel !== undefined && {
                            otherLabel: element.otherLabel
                        })}
                />
            );

        // Still to come, one type per step of Phase 5.
        case "statement":
        case "multi_choice":
        case "dropdown":
        case "short_text":
        case "long_text":
        case "opinion_scale":
        case "nps":
        case "matrix_single":
            return <UnavailablePreview />;

        default:
            return assertNever(element, "survey element");
    }
}
