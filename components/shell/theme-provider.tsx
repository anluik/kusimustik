"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * DESIGN.md §1: both themes ship, and the tokens switch on a `.dark` class —
 * `globals.css` declares `@custom-variant dark (&:is(.dark *))`. next-themes
 * writes that class before first paint, which is why the root layouts carry
 * `suppressHydrationWarning`.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            {children}
        </NextThemesProvider>
    );
}
