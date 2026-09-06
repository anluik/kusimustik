"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState
} from "react";

import type { QuestionId, SurveyId } from "@/domain/ids";
import { SurveyElementSchema, type SurveyElement } from "@/domain/question";
import {
    documentReducer,
    findElement,
    initialDocument
} from "@/lib/builder/document";
import type { SurveyActionError } from "@/lib/surveys/errors";
import { saveSurveyElementsAction } from "@/lib/surveys/actions";

/**
 * The builder's document and its autosave.
 *
 * The local document is the source of truth while the builder is open and is
 * never rolled back: an edit is applied immediately and the save follows it,
 * which is what makes typing feel like typing. What the server owns is the
 * *version* — the optimistic-concurrency token from `updateSurveyDefinition` —
 * so every save carries the version the last one returned and a second tab
 * loses the race loudly instead of silently overwriting. See
 * docs/DECISIONS.md 014.
 */

/** Long enough to swallow a burst of typing, short enough to feel automatic. */
const SAVE_DEBOUNCE_MS = 700;

export type BuilderSaveStatus =
    /** Everything the owner has typed is on the server. */
    | { readonly kind: "clean" }
    /** Edited; the debounce is running. */
    | { readonly kind: "pending" }
    | { readonly kind: "saving" }
    /** Held back: the document would not survive its own schema. */
    | { readonly kind: "invalid" }
    | { readonly kind: "failed"; readonly error: SurveyActionError };

type SaveState =
    | { readonly kind: "idle" }
    | { readonly kind: "saving" }
    | { readonly kind: "failed"; readonly error: SurveyActionError };

export type SurveyBuilder = {
    readonly elements: readonly SurveyElement[];
    readonly selectedId: QuestionId | null;
    readonly selected: SurveyElement | null;
    readonly status: BuilderSaveStatus;
    readonly select: (id: QuestionId | null) => void;
    readonly add: (element: SurveyElement) => void;
    readonly remove: (id: QuestionId) => void;
    readonly move: (id: QuestionId, to: number) => void;
    readonly replace: (element: SurveyElement) => void;
    /** Clears a failed save so the effect below picks the document up again. */
    readonly retry: () => void;
};

export function useSurveyBuilder({
    surveyId,
    initialElements,
    initialVersion
}: {
    readonly surveyId: SurveyId;
    readonly initialElements: readonly SurveyElement[];
    readonly initialVersion: number;
}): SurveyBuilder {
    const [doc, dispatch] = useReducer(
        documentReducer,
        initialElements,
        initialDocument
    );

    const [savedRevision, setSavedRevision] = useState(0);
    const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
    const versionRef = useRef(initialVersion);

    const { elements, revision } = doc;
    const dirty = revision !== savedRevision;

    // An element the schema rejects — an emptied option label, say — would come
    // back from the server as `invalidInput`, so it is held here instead: the
    // owner keeps typing, and the save resumes the moment the document is
    // whole again.
    const valid = useMemo(
        () =>
            elements.every(
                element => SurveyElementSchema.safeParse(element).success
            ),
        [elements]
    );

    const save = useCallback(
        async (at: number, saving: readonly SurveyElement[]) => {
            setSaveState({ kind: "saving" });

            const result = await saveSurveyElementsAction({
                surveyId,
                expectedVersion: versionRef.current,
                elements: [...saving]
            });

            if (!result.ok) {
                setSaveState({ kind: "failed", error: result.error });
                return;
            }

            versionRef.current = result.data.version;
            // `at`, not the current revision: edits made while this was in
            // flight are still unsaved, and the effect below will pick them up.
            setSavedRevision(at);
            setSaveState({ kind: "idle" });
        },
        [surveyId]
    );

    useEffect(() => {
        // One save in flight at a time. When it lands, `savedRevision` or
        // `saveState` changes, this runs again, and anything typed meanwhile is
        // saved then — with the version the last save returned.
        if (!dirty || !valid) return;
        if (saveState.kind !== "idle") return;

        const timer = setTimeout(() => {
            void save(revision, elements);
        }, SAVE_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [dirty, valid, saveState, revision, elements, save]);

    useEffect(() => {
        if (!dirty) return;

        // The debounce window, a failed save and an invalid document are all
        // ways to have unsaved work in a tab that is being closed. The browser
        // shows its own wording here; a message of ours would be ignored.
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const status = useMemo((): BuilderSaveStatus => {
        if (saveState.kind === "failed") {
            return { kind: "failed", error: saveState.error };
        }
        if (saveState.kind === "saving") return { kind: "saving" };
        if (!dirty) return { kind: "clean" };
        return valid ? { kind: "pending" } : { kind: "invalid" };
    }, [saveState, dirty, valid]);

    return {
        elements,
        selectedId: doc.selectedId,
        selected: findElement(elements, doc.selectedId),
        status,
        select: useCallback(
            (id: QuestionId | null) => dispatch({ kind: "select", id }),
            []
        ),
        add: useCallback(
            (element: SurveyElement) => dispatch({ kind: "add", element }),
            []
        ),
        remove: useCallback(
            (id: QuestionId) => dispatch({ kind: "remove", id }),
            []
        ),
        move: useCallback(
            (id: QuestionId, to: number) => dispatch({ kind: "move", id, to }),
            []
        ),
        replace: useCallback(
            (element: SurveyElement) => dispatch({ kind: "replace", element }),
            []
        ),
        retry: useCallback(() => setSaveState({ kind: "idle" }), [])
    };
}
