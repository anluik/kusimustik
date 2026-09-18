import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";

/**
 * DESIGN.md §1. Three faces, each with a job:
 *
 * - **Geist** for the interface. A neutral grotesque with real weight
 *   separation at small sizes, which is what a dense owner surface needs.
 * - **Source Serif 4** for display — survey titles, page titles, and the
 *   figures a panel exists to show. It carries an optical-size axis, so the
 *   same file is a text serif at 15px and a display serif at 40px rather than
 *   a text serif scaled up.
 * - **Geist Mono** for identifiers only: slugs, share links, keys, `⌘K`.
 *   Numbers are no longer mono (§2) — the sans and the serif both have
 *   tabular figures, and mono digits made every count look like a code.
 *
 * All three ship Cyrillic: Russian is a launch locale, and a display face that
 * silently falls back for one of three languages is not a display face.
 *
 * Declared once and shared by every root layout — `next/font` deduplicates by
 * module instance, so declaring them per layout would download two copies.
 */
export const sans = Geist({
    subsets: ["latin", "latin-ext", "cyrillic"],
    variable: "--font-sans",
    display: "swap"
});

export const display = Source_Serif_4({
    subsets: ["latin", "latin-ext", "cyrillic"],
    axes: ["opsz"],
    variable: "--font-display",
    display: "swap"
});

export const mono = Geist_Mono({
    subsets: ["latin", "latin-ext", "cyrillic"],
    variable: "--font-mono",
    display: "swap"
});
