import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

/**
 * One labelled control in the editor panel, with its help line and its error.
 *
 * The error is rendered from a message key, never from a Zod issue: the domain
 * schemas speak to developers (docs/DECISIONS.md 007), and the owner needs a
 * sentence in their own language telling them what to type.
 */
export function Field({
    id,
    label,
    help,
    error,
    children
}: {
    readonly id: string;
    readonly label: string;
    readonly help?: string;
    readonly error?: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <Label
                htmlFor={id}
                className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase"
            >
                {label}
            </Label>
            {children}
            {help !== undefined && (
                <p className="text-[11px] leading-[1.35] text-muted-foreground">
                    {help}
                </p>
            )}
            {error !== undefined && (
                <p
                    id={`${id}-error`}
                    className="text-[11px] leading-[1.35] text-destructive"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

/** A switch and its label, which read as one row rather than as a field. */
export function ToggleRow({
    id,
    label,
    control
}: {
    readonly id: string;
    readonly label: string;
    readonly control: ReactNode;
}) {
    return (
        <div className="flex min-h-8 items-center justify-between gap-3">
            <Label htmlFor={id} className="text-xs leading-[1.35] font-normal">
                {label}
            </Label>
            {control}
        </div>
    );
}
