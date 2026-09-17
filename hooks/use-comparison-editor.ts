"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { ComparisonDocumentSchema } from "@/domain/comparison";
import type { ComparisonDocument } from "@/domain/comparison";
import type { ComparisonId } from "@/domain/ids";
import type { AutosaveStatus } from "@/lib/autosave";
import { saveComparisonAction } from "@/lib/comparisons/actions";
import { editorReducer, initialEditorState } from "@/lib/comparisons/editor";
import type { EditorAction } from "@/lib/comparisons/editor";
import type { ComparisonActionError } from "@/lib/comparisons/errors";

/**
 * The matching editor's document and its autosave.
 *
 * The same loop as the builder's (docs/DECISIONS.md 014): the local document is
 * the source of truth while the editor is open, a change is applied at once
 * and a debounced save follows, one save is in flight at a time, the version
 * the last save returned rides on the next, and a failure stops the loop
 * until the owner acts on it.
 *
 * Every failure but a generic one is offered a reload rather than a retry. A
 * conflict means another tab saved; `refused` means a question changed under
 * the editor so that a row it holds no longer fits; `notFound` means the
 * comparison is gone; `invalidInput` means the server disagrees with what the
 * editor believes the group looks like. Sending the same document again would
 * fail the same way every time.
 */

/** Long enough to swallow a burst of choosing, short enough to feel automatic. */
const SAVE_DEBOUNCE_MS = 700;

type SaveState =
    | { readonly kind: "idle" }
    | { readonly kind: "saving" }
    | { readonly kind: "failed"; readonly error: ComparisonActionError };

export type ComparisonEditor = {
    readonly document: ComparisonDocument;
    readonly status: AutosaveStatus;
    readonly dispatch: (action: EditorAction) => void;
    /** Clears a failed save so the loop picks the document up again. */
    readonly retry: () => void;
};

export function useComparisonEditor({
    comparisonId,
    initialDocument,
    initialVersion
}: {
    readonly comparisonId: ComparisonId;
    /** Rows already in the order they should stay in; see `orderRows`. */
    readonly initialDocument: ComparisonDocument;
    readonly initialVersion: number;
}): ComparisonEditor {
    const [state, dispatch] = useReducer(
        editorReducer,
        initialDocument,
        initialEditorState
    );
    const [savedRevision, setSavedRevision] = useState(0);
    const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
    const [version, setVersion] = useState(initialVersion);

    const { document, revision } = state;
    const dirty = revision !== savedRevision;
    const valid = useMemo(
        () => ComparisonDocumentSchema.safeParse(document).success,
        [document]
    );

    const save = useCallback(
        async (
            at: number,
            saving: ComparisonDocument,
            expectedVersion: number
        ) => {
            setSaveState({ kind: "saving" });
            const result = await saveComparisonAction({
                comparisonId,
                expectedVersion,
                document: saving
            });
            if (!result.ok) {
                setSaveState({ kind: "failed", error: result.error });
                return;
            }
            setVersion(result.data.version);
            // `at`, not the current revision: changes made while this was in
            // flight are still unsaved, and the effect below will send them.
            setSavedRevision(at);
            setSaveState({ kind: "idle" });
        },
        [comparisonId]
    );

    useEffect(() => {
        if (!dirty || !valid) return;
        if (saveState.kind !== "idle") return;

        const timer = setTimeout(() => {
            void save(revision, document, version);
        }, SAVE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [dirty, valid, saveState, revision, document, version, save]);

    useEffect(() => {
        if (!dirty) return;
        // The browser shows its own wording; a message of ours is ignored.
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const status = useMemo((): AutosaveStatus => {
        if (saveState.kind === "failed") {
            return {
                kind: "failed",
                recovery: saveState.error === "failed" ? "retry" : "reload"
            };
        }
        if (saveState.kind === "saving") return { kind: "saving" };
        if (!dirty) return { kind: "clean" };
        return valid ? { kind: "pending" } : { kind: "invalid" };
    }, [saveState, dirty, valid]);

    return {
        document,
        status,
        dispatch,
        retry: useCallback(() => setSaveState({ kind: "idle" }), [])
    };
}
