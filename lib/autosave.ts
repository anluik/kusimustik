/**
 * Where an autosaving editor stands. Shared by the builder and the comparison
 * matching editor, which save the same way and fail the same two ways.
 */
export type AutosaveStatus =
    /** Everything the owner has done is on the server. */
    | { readonly kind: "clean" }
    /** Edited; the debounce is running. */
    | { readonly kind: "pending" }
    | { readonly kind: "saving" }
    /** Held back: the document would not survive its own schema. */
    | { readonly kind: "invalid" }
    /**
     * `reload` when trying again cannot help — another tab has already saved,
     * or what the editor holds no longer fits the server's state — and
     * `retry` for everything else.
     */
    | { readonly kind: "failed"; readonly recovery: "retry" | "reload" };
