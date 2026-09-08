"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * An element's rendered size, as reactive state.
 *
 * The DOM is an external store, so it is read through `useSyncExternalStore`
 * rather than mirrored into state from an effect: the snapshot is measured
 * during render, every render, and the `ResizeObserver` only says *when* to
 * look again. That is what makes this immune to the failure it was written
 * for — a component that measures once on mount, catches a box that has not
 * been laid out yet, and never looks again (docs/DECISIONS.md 020).
 *
 * The node arrives through a callback ref rather than a `useRef`, because a
 * ref does not re-render and the first measurement has to happen as soon as
 * the element exists. `subscribe` closes over that node, so React resubscribes
 * and re-reads the moment it does.
 *
 * Sizes are rounded: a fractional resize that rounds to the same integer is
 * not a change worth re-rendering for, and `useSyncExternalStore` compares
 * snapshots by value.
 */
export type ElementSize = {
    /** Attach to the element to measure. */
    readonly ref: (node: HTMLElement | null) => void;
    /** 0 before the element exists, and on the server. */
    readonly width: number;
    readonly height: number;
};

export function useElementSize(): ElementSize {
    const [node, setNode] = useState<HTMLElement | null>(null);

    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (node === null || typeof ResizeObserver === "undefined") {
                return () => {};
            }
            const observer = new ResizeObserver(onStoreChange);
            observer.observe(node);
            return () => observer.disconnect();
        },
        [node]
    );

    const width = useSyncExternalStore(
        subscribe,
        () => measure(node, "width"),
        () => 0
    );
    const height = useSyncExternalStore(
        subscribe,
        () => measure(node, "height"),
        () => 0
    );

    return { ref: setNode, width, height };
}

function measure(node: HTMLElement | null, axis: "width" | "height"): number {
    if (node === null) return 0;
    return Math.round(node.getBoundingClientRect()[axis]);
}
