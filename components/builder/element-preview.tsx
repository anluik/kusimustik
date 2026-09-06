"use client";

import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { assertNever } from "@/domain/assert-never";
import {
    NPS_MAX,
    NPS_MIN,
    OPINION_SCALE_MIN,
    type ChoiceOption,
    type SurveyElement
} from "@/domain/question";

/**
 * What a respondent will see, at the runner's density (DESIGN.md §4: 6px
 * radius, 13px type, option rows a thumb can hit) rather than the builder's.
 *
 * Nothing here is a real control. The card behind it is the click target that
 * selects the element, and a live radio inside it would compete for the click
 * and for the tab order without answering anything. The controls are therefore
 * drawn as shapes — which is also what lets the same markup stand in for a
 * radio, a checkbox and a scale step.
 *
 * The switch is exhaustive over all nine types and ends in `assertNever`, so a
 * tenth is a build error here as well as in the editor panel.
 */

function ControlShape({ shape }: { readonly shape: "radio" | "checkbox" }) {
    return (
        <span
            aria-hidden
            className={
                shape === "radio"
                    ? "size-4 shrink-0 rounded-full border-[1.5px] border-input"
                    : "size-4 shrink-0 rounded-[3px] border-[1.5px] border-input"
            }
        />
    );
}

/** A written-answer field, drawn as the bar the respondent types into. */
function WritingShape({ lines = 1 }: { readonly lines?: number }) {
    return (
        <span
            aria-hidden
            className="block w-full rounded-md border bg-ramp-track"
            style={{ height: `${lines * 20 + 16}px` }}
        />
    );
}

function OptionRow({
    label,
    shape
}: {
    readonly label: string;
    readonly shape: "radio" | "checkbox";
}) {
    return (
        <div className="flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2">
            <ControlShape shape={shape} />
            <span className="min-w-0 truncate text-[13px] leading-[1.4]">
                {label}
            </span>
        </div>
    );
}

function ChoicePreview({
    options,
    shape,
    otherLabel
}: {
    readonly options: readonly ChoiceOption[];
    readonly shape: "radio" | "checkbox";
    /** Present only when the question offers a written answer. */
    readonly otherLabel?: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            {options.map(option => (
                <OptionRow
                    key={option.value}
                    label={option.label}
                    shape={shape}
                />
            ))}
            {otherLabel !== undefined && (
                <>
                    <OptionRow label={otherLabel} shape={shape} />
                    <WritingShape />
                </>
            )}
        </div>
    );
}

/** The steps of a scale, as the row of targets the runner lays out. */
function ScalePreview({
    min,
    max,
    minLabel,
    maxLabel
}: {
    readonly min: number;
    readonly max: number;
    readonly minLabel?: string | undefined;
    readonly maxLabel?: string | undefined;
}) {
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
        <div className="flex flex-col gap-2">
            {/* A grid, not a wrapping flex row: eleven NPS steps do not fit
                across a phone, and `flex-1` would stretch whatever landed on
                the last line into a row of odd widths. `auto-fit` keeps every
                step on the same track and the wrap tidy. */}
            <div
                className="grid gap-1.5"
                style={{
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(2.75rem, 1fr))"
                }}
            >
                {steps.map(step => (
                    <span
                        key={step}
                        className="flex h-11 items-center justify-center rounded-md border text-[13px] leading-none tabular-nums"
                    >
                        {step}
                    </span>
                ))}
            </div>
            {(minLabel !== undefined || maxLabel !== undefined) && (
                <div className="flex justify-between gap-3 text-[11px] leading-[1.35] text-muted-foreground">
                    <span className="truncate">{minLabel ?? ""}</span>
                    <span className="truncate text-right">
                        {maxLabel ?? ""}
                    </span>
                </div>
            )}
        </div>
    );
}

export function ElementPreview({
    element
}: {
    readonly element: SurveyElement;
}) {
    switch (element.type) {
        // Shown, not asked: the card above already renders its text, and the
        // respondent meets no control at all.
        case "statement":
            return null;

        case "single_choice":
            return (
                <ChoicePreview
                    options={element.options}
                    shape="radio"
                    {...(element.allowOther &&
                        element.otherLabel !== undefined && {
                            otherLabel: element.otherLabel
                        })}
                />
            );

        case "multi_choice":
            return (
                <ChoicePreview
                    options={element.options}
                    shape="checkbox"
                    {...(element.allowOther &&
                        element.otherLabel !== undefined && {
                            otherLabel: element.otherLabel
                        })}
                />
            );

        case "dropdown":
            return <DropdownPreview element={element} />;

        case "short_text":
            return <WritingShape />;

        case "long_text":
            return <WritingShape lines={3} />;

        case "opinion_scale":
            return (
                <ScalePreview
                    min={OPINION_SCALE_MIN}
                    max={element.max}
                    minLabel={element.minLabel}
                    maxLabel={element.maxLabel}
                />
            );

        case "nps":
            return <NpsPreview />;

        case "matrix_single":
            return (
                <MatrixPreview rows={element.rows} columns={element.columns} />
            );

        default:
            return assertNever(element, "survey element");
    }
}

function DropdownPreview({
    element
}: {
    readonly element: { readonly options: readonly ChoiceOption[] };
}) {
    const t = useTranslations("Builder.preview");

    return (
        <div className="flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.4] text-muted-foreground">
                {t("dropdownPlaceholder", { count: element.options.length })}
            </span>
            <ChevronsUpDown
                aria-hidden
                className="size-4 shrink-0 text-input"
            />
        </div>
    );
}

function NpsPreview() {
    const t = useTranslations("Builder.preview");

    return (
        <ScalePreview
            min={NPS_MIN}
            max={NPS_MAX}
            minLabel={t("npsMinLabel")}
            maxLabel={t("npsMaxLabel")}
        />
    );
}

/**
 * The matrix, as a grid rather than a table: it is a picture of one, with no
 * headers to associate and no cells to read, and the runner draws its own —
 * a `table` here would announce an empty data table to a screen reader.
 */
function MatrixPreview({
    rows,
    columns
}: {
    readonly rows: readonly ChoiceOption[];
    readonly columns: readonly ChoiceOption[];
}) {
    // Real minimums rather than `0`, so a matrix too wide for the card scrolls
    // inside its own container instead of truncating every label to nothing.
    const template = `minmax(7rem,1.4fr) repeat(${columns.length}, minmax(3.5rem,1fr))`;

    return (
        <div className="overflow-x-auto">
            <div
                aria-hidden
                className="grid min-w-full gap-x-2 gap-y-1"
                style={{ gridTemplateColumns: template }}
            >
                <span />
                {columns.map(column => (
                    <span
                        key={column.value}
                        className="truncate pb-1 text-center text-[11px] leading-[1.35] text-muted-foreground"
                    >
                        {column.label}
                    </span>
                ))}

                {rows.map(row => (
                    <div key={row.value} className="contents">
                        <span className="flex min-h-11 items-center truncate border-t text-[13px] leading-[1.4]">
                            {row.label}
                        </span>
                        {columns.map(column => (
                            <span
                                key={column.value}
                                className="flex min-h-11 items-center justify-center border-t"
                            >
                                <ControlShape shape="radio" />
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
