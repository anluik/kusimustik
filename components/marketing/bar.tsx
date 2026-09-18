import { barWidth } from "@/lib/results/chart-data";
import { cn } from "@/lib/utils";

/**
 * One horizontal bar on the landing page, to DESIGN.md §7's marks rule: thin
 * (14px here, under the 18px cap), the data end rounded and the baseline end
 * square, a `--ramp-track` groove behind it carrying a hairline so a bar at
 * nothing is still a readable row.
 *
 * Labels sit outside the fill rather than inside it. §7 allows either, but the
 * fills on this page spend most of their life at 0%, and a label that has to
 * move out of the bar below some width is a rule with a seam in it.
 */
export function Bar({
    label,
    percent,
    value,
    emphasis = false,
    aside,
    fill = "var(--chart-1)",
    bordered = false,
    labelHidden = false
}: {
    readonly label: string;
    /** 0-100. */
    readonly percent: number;
    /** The already-formatted figure, e.g. "38,2%". */
    readonly value: string;
    /** The one value the plate exists to point at (§7). */
    readonly emphasis?: boolean;
    /** A short note after the label, "your answer". */
    readonly aside?: string | undefined;
    /**
     * The fill, as a CSS colour. Defaults to `--chart-1`, which §7 gives to a
     * single series; ordered data passes `rampFill(step)` instead, together
     * with `bordered`, because §7 requires every ramp fill to carry a hairline:
     * it is what keeps a low bar readable against the card *and* against the
     * muted track behind it.
     */
    readonly fill?: string;
    readonly bordered?: boolean;
    /**
     * Hide the label visually where the row already carries it, a wave's year
     * sits beside its bar rather than above it. It stays in the accessible
     * name, because a bar with no name is a rectangle.
     */
    readonly labelHidden?: boolean;
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
            {/* The label keeps its grid cell even when it is not shown:
                `sr-only` is absolutely positioned, so hiding the element that
                way would take it out of the grid's flow and move the figure
                into the label's column, right-aligned text, suddenly on the
                left. The cell stays; only its contents go. */}
            <p
                className={cn(
                    "min-w-0 text-[13px] leading-[1.25] text-pretty",
                    emphasis ? "font-medium" : "font-normal"
                )}
            >
                <span className={cn(labelHidden && "sr-only")}>{label}</span>
                {aside !== undefined && (
                    <span className="ml-2 text-[11px] leading-none font-medium text-muted-foreground">
                        {aside}
                    </span>
                )}
            </p>
            <p
                className={cn(
                    "text-[12px] leading-none tabular-nums",
                    emphasis
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                )}
            >
                {value}
            </p>
            <div className="col-span-2 h-3.5 rounded-l-none rounded-r-[4px] border border-border bg-ramp-track">
                <div
                    className={cn(
                        "h-full rounded-l-none rounded-r-[3px]",
                        bordered && "border border-border",
                        // The one authored transition on this plate: a bar
                        // grows from its baseline when the answer lands.
                        "motion-safe:transition-[width] motion-safe:duration-[620ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
                        emphasis && "outline outline-1 outline-foreground"
                    )}
                    style={{
                        // The results surface's own width helper, not a second
                        // copy of the rule: a dot decimal, never a
                        // locale-formatted one, because `width: '39,6%'` is
                        // invalid CSS and is dropped in silence (DESIGN §7).
                        width: barWidth(percent),
                        backgroundColor: fill
                    }}
                />
            </div>
        </div>
    );
}
