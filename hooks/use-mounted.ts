"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards.
 *
 * Needed wherever a value only the browser knows — the resolved theme, say —
 * decides what is rendered: reading it during hydration is a mismatch, and
 * reading it in an effect is a cascading render. `useSyncExternalStore` says
 * exactly this with its two snapshot functions.
 */
export function useMounted(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    );
}
