"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { SurveyLocale } from "@/domain/content";
import { referenceTexts, type TextPath } from "@/domain/localize";
import type { AuthoredElement } from "@/domain/question";
import type { ElementCopy } from "@/lib/builder/element-copy";

/**
 * Which language the editor panel is editing, and what the element being
 * edited says in the language it is being translated from.
 *
 * This is the whole of PLAN Phase 12's "without the editor panel doubling in
 * size": the panel keeps its one column of fields and switches which language
 * they hold, and the sentence the author is translating *from* appears as the
 * field's placeholder rather than as a second field beside it. See
 * docs/DECISIONS.md 031.
 *
 * A context rather than a prop, because the alternative was threading two
 * more props through all nine editors and the shared field components under
 * them — nine files that have no other reason to know translation exists.
 *
 * It also carries the seed words for anything the panel *creates* — a new
 * option, the label that comes in with the "other" toggle — because those are
 * survey content and belong to the language being edited rather than to the
 * one the app is being read in (docs/DECISIONS.md 032).
 */

type TranslationTarget = {
    /** The language the panel's fields hold. */
    readonly locale: SurveyLocale;
    /** The language the survey is written in; everything's fallback. */
    readonly source: SurveyLocale;
    /** Editing anything other than the survey's own language. */
    readonly translating: boolean;
    /**
     * What each field of the element being edited says to a reader today —
     * this language if it is written, the survey's own if not.
     */
    readonly reference: ReadonlyMap<TextPath, string>;
    /** The words a new option or label is born with, in `locale`. */
    readonly copy: ElementCopy;
};

const EMPTY: ReadonlyMap<TextPath, string> = new Map();

/**
 * There is no sensible default for the seed words, so the context holds none:
 * every consumer of this is rendered inside the builder's provider, and a
 * fallback would be a second, silently wrong copy of the catalogue.
 */
const TranslationContext = createContext<TranslationTarget | null>(null);

export function TranslationProvider({
    locale,
    source,
    element,
    copy,
    children
}: {
    readonly locale: SurveyLocale;
    readonly source: SurveyLocale;
    /** The element the panel is editing; null when nothing is selected. */
    readonly element: AuthoredElement | null;
    /** The seed words in `locale`; see `lib/builder/element-copy.ts`. */
    readonly copy: ElementCopy;
    readonly children: ReactNode;
}) {
    const value = useMemo(
        (): TranslationTarget => ({
            locale,
            source,
            translating: locale !== source,
            reference:
                element === null
                    ? EMPTY
                    : referenceTexts(element, locale, source),
            copy
        }),
        [locale, source, element, copy]
    );

    return <TranslationContext value={value}>{children}</TranslationContext>;
}

export function useTranslationTarget(): TranslationTarget {
    const value = useContext(TranslationContext);
    if (value === null) {
        throw new Error("useTranslationTarget outside a TranslationProvider");
    }
    return value;
}

/**
 * What one field of the element being edited says to a reader today, or
 * `undefined` if it says nothing in any language.
 *
 * Two uses, and they are the same question asked twice. As a **placeholder**
 * it is the sentence being translated from, shown in grey behind an empty
 * field. As the test for a **required-field error** it is what distinguishes
 * "not translated yet", which is a normal state and no error, from "written in
 * no language at all", which is the document the save is being held on.
 *
 * Returns a lookup rather than one field's text so that a list of options can
 * ask about each of its rows without calling a hook per row.
 */
export function useReferenceText(): (path: TextPath) => string | undefined {
    const { reference } = useTranslationTarget();
    return useMemo(
        () => (path: TextPath) => {
            const text = reference.get(path);
            return text === undefined || text.trim() === "" ? undefined : text;
        },
        [reference]
    );
}
