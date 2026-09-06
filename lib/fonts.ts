import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

/**
 * DESIGN.md §1: IBM Plex Sans for UI, IBM Plex Mono for numbers, codes,
 * metadata and labels. §2 restricts the interior to two weights (400/500);
 * 600 is reserved for panel heads and metrics.
 *
 * Defined once and shared by every root layout — `next/font` deduplicates by
 * module instance, so declaring these per layout would download two copies.
 */
export const sans = IBM_Plex_Sans({
    subsets: ["latin", "latin-ext", "cyrillic"],
    weight: ["400", "500", "600"],
    variable: "--font-sans",
    display: "swap"
});

export const mono = IBM_Plex_Mono({
    subsets: ["latin", "latin-ext", "cyrillic"],
    weight: ["400", "500"],
    variable: "--font-mono",
    display: "swap"
});
