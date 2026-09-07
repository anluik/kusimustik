/**
 * The `docs/DESIGN.md` §2 type levels the results surface uses, named once.
 *
 * The survey list keeps its equivalents local because it needs two of them;
 * results spans a dozen components and every one of them needs the Label and
 * Meta levels, which is exactly how a `text-[10px]` drifts into a `text-xs` in
 * one card and nobody notices.
 */

/** Metric — stat card figures. */
export const METRIC =
    "text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums";

/** Panel head — card and panel headers. */
export const PANEL_HEAD = "text-[13px] leading-[1.2] font-semibold";

/** Meta — counts, timestamps, drop figures. Mono. */
export const META = "font-mono text-[11px] leading-none tabular-nums";

/** Label — column headers, section labels, stat card labels. Mono. */
export const LABEL =
    "font-mono text-[10px] leading-none tracking-[0.07em] uppercase";

/** Tag — status badges, question-type tags. Mono. */
export const TAG =
    "font-mono text-[9px] leading-none tracking-[0.04em] uppercase";
