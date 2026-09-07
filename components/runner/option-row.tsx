"use client";

import { cn } from "@/lib/utils";

/**
 * One tappable answer option (DESIGN.md §4): at least 48px tall, a real
 * control, and a selected state that is a border, a fill *and* a filled
 * control — colour alone never carries state (§10).
 *
 * The input is a native radio or checkbox rather than a Radix primitive. The
 * runner is the one surface where the visitor cannot be asked to use a modern
 * browser or to wait for hydration: native controls have the right keyboard
 * behaviour, the right screen-reader semantics and the right on-screen
 * keyboard before any of our JavaScript arrives. `accent-color` is what makes
 * them the survey's colour without giving that up. See docs/DECISIONS.md 016.
 */
export function OptionRow({
    type,
    name,
    value,
    checked,
    label,
    onSelect
}: {
    readonly type: "radio" | "checkbox";
    readonly name: string;
    readonly value: string;
    readonly checked: boolean;
    readonly label: string;
    readonly onSelect: (checked: boolean) => void;
}) {
    return (
        <label
            className={cn(
                "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-survey border px-3 py-2 text-[14px] leading-[1.35] transition-colors",
                "has-[:focus-visible]:border-survey-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/18",
                checked
                    ? "border-[1.5px] border-survey-primary bg-survey-accent text-survey-accent-foreground"
                    : "border-input hover:bg-muted/60"
            )}
        >
            <input
                type={type}
                name={name}
                value={value}
                checked={checked}
                onChange={event => onSelect(event.target.checked)}
                className="size-[18px] shrink-0 accent-survey-primary"
            />
            <span className="min-w-0">{label}</span>
        </label>
    );
}

/** The free-text field that appears beside a chosen "other" option. */
export function OtherField({
    id,
    value,
    placeholder,
    label,
    onChange
}: {
    readonly id: string;
    readonly value: string;
    readonly placeholder: string;
    readonly label: string;
    readonly onChange: (value: string) => void;
}) {
    return (
        <>
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <input
                id={id}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={event => onChange(event.target.value)}
                className="min-h-12 w-full rounded-survey border border-input bg-survey-card px-3 py-2 text-[14px] leading-[1.35] outline-none focus-visible:border-survey-primary focus-visible:ring-[3px] focus-visible:ring-ring/18"
            />
        </>
    );
}
