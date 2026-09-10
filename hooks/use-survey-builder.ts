"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState
} from "react";

import type { LocalizedText, SurveyLocale } from "@/domain/content";
import type { QuestionId, SurveyId } from "@/domain/ids";
import {
    authorElement,
    elementTexts,
    headTexts,
    projectElements,
    projectHead,
    resolveElements,
    resolveHead
} from "@/domain/localize";
import type { TextPath } from "@/domain/localize";
import type { AuthoredElement, SurveyElement } from "@/domain/question";
import {
    AuthoredElementsSchema,
    AuthoredSurveyHeadSchema
} from "@/domain/survey";
import type { AuthoredSurveyHead, SurveyHead } from "@/domain/survey";
import {
    HEAD,
    documentReducer,
    findElement,
    initialDocument
} from "@/lib/builder/document";
import type { BuilderSelection } from "@/lib/builder/document";
import type { SurveyKeys } from "@/lib/builder/keys";
import { duplicateElement } from "@/lib/builder/new-element";
import type { SurveyActionError } from "@/lib/surveys/errors";
import { saveSurveyDocumentAction } from "@/lib/surveys/actions";

/**
 * The builder's document, the language it is being edited in, and its autosave.
 *
 * The local document is the source of truth while the builder is open and is
 * never rolled back: an edit is applied immediately and the save follows it,
 * which is what makes typing feel like typing. What the server owns is the
 * *version* — the optimistic-concurrency token from `updateSurveyDefinition` —
 * so every save carries the version the last one returned and a second tab
 * loses the race loudly instead of silently overwriting. See
 * docs/DECISIONS.md 014.
 *
 * What it holds is the *stored* document, every language at once, and the
 * three views of it below are derived (docs/DECISIONS.md 031):
 *
 * - `stored` is what is saved. Nothing else may be, or an edit made in one
 *   language would delete the others.
 * - `elements` is the active language and only the active language, blanks
 *   included. It is what the editor panel binds to, so an untranslated field
 *   is an empty field rather than the language it is being translated from.
 * - `shown` is what a respondent reading in the active language would get
 *   today, fallback and all. It is what the canvas and the element list draw,
 *   because a preview that blanked every untranslated question would be
 *   describing a survey nobody will ever see.
 *
 * An edit arrives as one language of an element and is *merged* back, so the
 * translations the panel never showed survive it.
 */

/** Long enough to swallow a burst of typing, short enough to feel automatic. */
/** Nothing is selected only in the instant before a selection exists. */
const EMPTY_TEXTS: ReadonlyMap<TextPath, LocalizedText> = new Map();

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
    /** The survey's own words as they are stored — what the save sends. */
    readonly storedHead: AuthoredSurveyHead;
    /** The active language alone — what the header block's fields edit. */
    readonly head: SurveyHead;
    /** The same as a respondent would read them, fallback included. */
    readonly shownHead: SurveyHead;
    /** The document as it is stored: every language the author has written. */
    readonly stored: readonly AuthoredElement[];
    /** The active language alone — what the editor panel edits. */
    readonly elements: readonly SurveyElement[];
    /** The same elements as a respondent would read them, fallback included. */
    readonly shown: readonly SurveyElement[];
    readonly selectedId: BuilderSelection;
    readonly selected: SurveyElement | null;
    /** The selected element with its other languages still attached. */
    readonly selectedStored: AuthoredElement | null;
    /**
     * Every piece of text on whatever is selected, addressed by path — the
     * head's or an element's. It is what the editor panel's placeholders are
     * read from, and it lives here because this hook is the only thing that
     * knows translation exists.
     */
    readonly selectedTexts: ReadonlyMap<TextPath, LocalizedText>;
    readonly status: BuilderSaveStatus;
    /**
     * The optimistic-concurrency token the next save will carry. Exposed
     * because the survey settings are saved outside this hook and bump it too,
     * and a save that guessed would lose its next autosave to a conflict it
     * did not cause.
     */
    readonly version: number;
    readonly select: (id: BuilderSelection) => void;
    /** A new element, authored into the survey's own language. */
    readonly add: (element: SurveyElement) => void;
    readonly remove: (id: QuestionId) => void;
    /** Copies every language of the element, not the one on screen. */
    readonly duplicate: (id: QuestionId) => void;
    readonly move: (id: QuestionId, to: number) => void;
    /** One language of an element, merged into the translations it has. */
    readonly replace: (element: SurveyElement) => void;
    /** The same for the survey's own title and intro. */
    readonly replaceHead: (head: SurveyHead) => void;
    /** Adopts the version another save of this survey just returned. */
    readonly syncVersion: (version: number) => void;
    /** Clears a failed save so the effect below picks the document up again. */
    readonly retry: () => void;
    /**
     * The key rules, with everything this session has retired folded in, and
     * frozen outright while a translation is being edited. Use this rather
     * than the `keys` passed in — see `retired` below.
     */
    readonly keys: SurveyKeys;
};

export function useSurveyBuilder({
    surveyId,
    initialHead,
    initialElements,
    initialVersion,
    keys,
    source,
    locale
}: {
    readonly surveyId: SurveyId;
    /** The survey's own words, as the repository handed them over. */
    readonly initialHead: AuthoredSurveyHead;
    /** The stored document, as the repository handed it over. */
    readonly initialElements: readonly AuthoredElement[];
    readonly initialVersion: number;
    /** As the page read them; the hook adds what this session retires. */
    readonly keys: SurveyKeys;
    /** The language the survey is written in, and everything's fallback. */
    readonly source: SurveyLocale;
    /** The language being edited, which is `source` unless translating. */
    readonly locale: SurveyLocale;
}): SurveyBuilder {
    const [doc, dispatch] = useReducer(
        documentReducer,
        { head: initialHead, elements: initialElements },
        ({ head, elements }) => initialDocument(head, elements)
    );

    const [savedRevision, setSavedRevision] = useState(0);
    const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
    const [version, setVersion] = useState(initialVersion);

    const { head: storedHead, elements: stored, revision } = doc;
    const dirty = revision !== savedRevision;

    const elements = useMemo(
        () => projectElements(stored, locale),
        [stored, locale]
    );
    const shown = useMemo(
        () => resolveElements(stored, locale, source),
        [stored, locale, source]
    );
    const head = useMemo(
        () => projectHead(storedHead, locale),
        [storedHead, locale]
    );
    const shownHead = useMemo(
        () => resolveHead(storedHead, locale, source),
        [storedHead, locale, source]
    );

    // A document the schema rejects — an option label emptied in its last
    // language, say — would come back from the server as `invalidInput`, so it
    // is held here instead: the owner keeps typing, and the save resumes the
    // moment the document is whole again.
    //
    // The *stored* shape, not the projected one: a title with no Russian is a
    // perfectly good document, and holding the save on it would stop the
    // builder saving for as long as a translation is unfinished.
    //
    // `AuthoredElementsSchema`, not a per-element parse: a key two questions
    // both claim is invalid without either element being invalid on its own,
    // and holding the save is the whole point — a save that goes out and
    // fails leaves a "save failed" the owner cannot retry out of, on top of
    // the field error that already explained the problem.
    //
    // The head is held to the same rule, and the three cases it can be in are
    // worth saying out loud, because the failure mode is a builder that
    // silently stopped saving while someone was translating:
    //
    //   * a title emptied in *every* language is `{}`, which the schema
    //     refuses — the save is held, exactly as it is for a question titled
    //     in no language;
    //   * a title merely untranslated in the language on screen is still
    //     `{ et: "..." }` and parses, so the save goes out;
    //   * an intro emptied everywhere never reaches `{}` at all — `mergeHead`
    //     withdraws it to absent, which is a valid unfilled optional.
    const valid = useMemo(
        () =>
            AuthoredSurveyHeadSchema.safeParse(storedHead).success &&
            AuthoredElementsSchema.safeParse(stored).success,
        [storedHead, stored]
    );

    // Keys this session has retired: an element that leaves the document takes
    // its key out of circulation for as long as the builder is open.
    //
    // The page's own list is a snapshot from load, and a question deleted
    // *here* is tombstoned by the save that follows — so without this the very
    // next question would derive the key that tombstone is now holding and the
    // save would be refused. Reserving on removal rather than on tombstoning
    // is deliberately conservative: the builder cannot know whether a question
    // was answered, and recycling a key a moment after discarding it buys
    // nothing worth a failed save.
    //
    // Keyed on the element leaving, never on its key changing, so retitling a
    // question under `derive` and then undoing the retitle still lands back on
    // the key it started with.
    const [retired, setRetired] = useState<readonly string[]>([]);
    const previous = useRef(stored);

    useEffect(() => {
        const present = new Set(stored.map(element => element.id));
        const gone = previous.current
            .filter(element => !present.has(element.id))
            .map(element => element.key);
        previous.current = stored;

        if (gone.length > 0) {
            setRetired(before => [
                ...before,
                ...gone.filter(key => !before.includes(key))
            ]);
        }
    }, [stored]);

    const translating = locale !== source;

    const surveyKeys = useMemo(
        (): SurveyKeys => ({
            // A key is machine-facing and derived from the title, so while a
            // translation is being edited there is no title to derive it from
            // that would not name the CSV column in the wrong language.
            policy: translating ? "freeze" : keys.policy,
            reserved: [
                ...keys.reserved,
                ...retired.filter(key => !keys.reserved.includes(key))
            ]
        }),
        [keys.policy, keys.reserved, retired, translating]
    );

    // The version is a parameter rather than something this closes over, so a
    // save can never go out carrying a token from a render that has since been
    // replaced — by another save, or by the settings dialog.
    const save = useCallback(
        async (
            at: number,
            savingHead: AuthoredSurveyHead,
            saving: readonly AuthoredElement[],
            expectedVersion: number
        ) => {
            setSaveState({ kind: "saving" });

            const result = await saveSurveyDocumentAction({
                surveyId,
                expectedVersion,
                title: savingHead.title,
                description: savingHead.description ?? null,
                elements: [...saving]
            });

            if (!result.ok) {
                setSaveState({ kind: "failed", error: result.error });
                return;
            }

            setVersion(result.data.version);
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
            void save(revision, storedHead, stored, version);
        }, SAVE_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [dirty, valid, saveState, revision, storedHead, stored, version, save]);

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

    const selectedStored = findElement(stored, doc.selectedId);
    const selectedTexts = useMemo(
        () =>
            doc.selectedId === HEAD
                ? headTexts(storedHead)
                : selectedStored === null
                  ? EMPTY_TEXTS
                  : elementTexts(selectedStored),
        [doc.selectedId, storedHead, selectedStored]
    );

    return {
        storedHead,
        head,
        shownHead,
        stored,
        elements,
        shown,
        keys: surveyKeys,
        selectedId: doc.selectedId,
        selected: findElement(elements, doc.selectedId),
        selectedStored,
        selectedTexts,
        status,
        version,
        select: useCallback(
            (id: BuilderSelection) => dispatch({ kind: "select", id }),
            []
        ),
        add: useCallback(
            (element: SurveyElement) =>
                dispatch({
                    kind: "add",
                    element: authorElement(element, source)
                }),
            [source]
        ),
        remove: useCallback(
            (id: QuestionId) => dispatch({ kind: "remove", id }),
            []
        ),
        duplicate: useCallback(
            (id: QuestionId) => {
                const element = findElement(stored, id);
                if (element === null) return;
                dispatch({
                    kind: "duplicate",
                    id,
                    copy: duplicateElement(element, source, stored, surveyKeys)
                });
            },
            [stored, source, surveyKeys]
        ),
        move: useCallback(
            (id: QuestionId, to: number) => dispatch({ kind: "move", id, to }),
            []
        ),
        replace: useCallback(
            (element: SurveyElement) =>
                dispatch({ kind: "replace", element, locale }),
            [locale]
        ),
        replaceHead: useCallback(
            (next: SurveyHead) =>
                dispatch({ kind: "replaceHead", head: next, locale }),
            [locale]
        ),
        syncVersion: useCallback((next: number) => setVersion(next), []),
        retry: useCallback(() => setSaveState({ kind: "idle" }), [])
    };
}
