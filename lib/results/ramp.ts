/**
 * The ordered ramp, `--ramp-1` … `--ramp-7`.
 *
 * `docs/DESIGN.md` §7: ordered data always uses the ramp, never the categorical
 * palette, and **the ramp encodes position in the sequence, not health** — a
 * stage is never recoloured for performing badly. Problem stages are flagged in
 * the row chrome instead, which keeps the colour channel honest and the flag
 * readable for someone who cannot see the hue difference.
 */

export const RAMP_STEPS = 7;

/** A step of the ramp, 1-based. Not a colour: the caller maps it to a token. */
export type RampStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Bins position `index` of `count` ordered items onto the seven ramp steps,
 * monotonically and front to back.
 *
 * `ceil((index + 1) * 7 / count)` is the formula, chosen because it reproduces
 * DESIGN §7's worked example exactly — fifteen funnel stages bin to
 * `[1,1,2,2,3,3,4,4,5,5,6,6,7,7,7]` — and because it degrades sensibly the
 * other way: fewer than seven items spread across the whole ramp rather than
 * crowding into its pale end, where §7 notes steps 1–4 fall below 3:1 on
 * `--card`.
 */
export function rampStep(index: number, count: number): RampStep {
    if (count <= 0) return 1;
    const clamped = Math.min(Math.max(index, 0), count - 1);
    const step = Math.ceil(((clamped + 1) * RAMP_STEPS) / count);
    return Math.min(Math.max(step, 1), RAMP_STEPS) as RampStep;
}

/**
 * The CSS variable holding a ramp step's fill. §7 requires every ramp fill to
 * carry `border: 1px solid var(--border)` as well — steps 1–4 are below 3:1 on
 * `--card` and an isolated low bar would otherwise vanish. The components pair
 * this with that border; neither is optional.
 */
export function rampFill(step: RampStep): string {
    return `var(--ramp-${step})`;
}

/**
 * The colour for a value label sitting **on** a ramp fill.
 *
 * §7: the label flips from `--foreground` to `--background` at step 5 in light
 * and step 4 in dark, and says to read `--ramp-label-flip` rather than
 * hardcoding either. Doing that in CSS rather than JavaScript is the only way
 * to get it right, because the flip point changes with the theme and the theme
 * is not known at render time on the server.
 *
 * `color-mix` clamps a percentage outside 0–100%, which turns the comparison
 * into arithmetic: the mix is `(step - flip + 1) × 100%` background, so it is
 * 0% or less below the flip point (all foreground) and 100% or more at and
 * above it (all background).
 *
 * Only used where a label has nowhere else to go — inside a stacked segment.
 * Everywhere else the label sits beside the bar, which §7 also permits and
 * which needs no flip at all.
 */
export function rampLabelColor(step: RampStep): string {
    return `color-mix(in oklab, var(--background) calc((${step} - var(--ramp-label-flip) + 1) * 100%), var(--foreground))`;
}
