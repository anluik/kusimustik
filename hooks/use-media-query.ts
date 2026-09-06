"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as reactive state, without setting state from an effect.
 *
 * The server snapshot is `false` — there is no viewport to measure during the
 * server render — so a layout built on this must have the wide, unqualified
 * case as its `false` branch: that is what the server renders, and the first
 * client render matches it before the subscription reports otherwise.
 *
 * Only for behaviour CSS cannot express, such as choosing between two
 * different components. Anything that is purely visual belongs in a Tailwind
 * breakpoint.
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            const list = window.matchMedia(query);
            list.addEventListener("change", onStoreChange);
            return () => list.removeEventListener("change", onStoreChange);
        },
        [query]
    );

    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(query).matches,
        () => false
    );
}
