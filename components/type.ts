/**
 * The `docs/DESIGN.md` §2 type scale, named once for the whole app.
 *
 * Every surface used to keep its own copies of these strings, which is exactly
 * how one card's label drifted to `text-xs` while its neighbour stayed at 10px.
 * There is one definition of each level here and no local equivalents.
 *
 * Three faces, three jobs (§1): `font-display` is the serif and belongs to
 * titles and to the figures a panel exists to show; `font-mono` is for
 * identifiers a person may have to copy or compare character by character;
 * everything else is the sans. Numbers are *not* mono — both other faces have
 * tabular figures, which is what actually makes a column line up.
 */

/** Display — a survey's name where it is the subject of the page. */
export const DISPLAY =
    "font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.015em]";

/** Metric — the figure a stat card exists to show. */
export const METRIC =
    "font-display text-[32px] leading-[0.95] font-semibold tracking-[-0.01em] tabular-nums";

/** Title — a survey or page name in a bar, a row or a card header. */
export const TITLE = "font-display text-[17px] leading-[1.25] font-semibold";

/** Question — question text on the builder canvas and the results card. */
export const QUESTION = "text-[15px] leading-[1.4] font-medium";

/** Panel head — card and panel headers. */
export const PANEL_HEAD = "text-[13px] leading-[1.2] font-semibold";

/** Row title — survey list rows, the app bar's current item. */
export const ROW_TITLE = "text-[13px] leading-[1.25] font-medium";

/** Body — respondent-facing prose and option labels. */
export const BODY = "text-[15px] leading-[1.45]";

/** UI — buttons, inputs, selects, list cells, nav items. */
export const UI = "text-xs leading-none";

/** Meta — counts, timestamps, drop figures. Sans, tabular. */
export const META = "text-[12px] leading-none tabular-nums";

/**
 * Label — column headers, section labels, stat card labels. Sentence case:
 * the all-caps mono label was the loudest thing on a quiet screen, and in
 * Estonian and Russian it also cost the most width (§9).
 */
export const LABEL =
    "text-[11px] leading-none font-medium tracking-[0.005em] text-muted-foreground";

/** Tag — status badges, question-type tags. */
export const TAG = "text-[11px] leading-none font-medium";

/** Code — slugs, share links, question keys, `⌘K`. The only mono left. */
export const CODE = "font-mono text-[12px] leading-none";
