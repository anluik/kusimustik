"use client";

import { createContext, useContext } from "react";

/**
 * How many responses the survey being edited has already collected.
 *
 * A context rather than a prop because the one place that most needs it —
 * `OptionListEditor`, where a choice is removed — sits four editors below the
 * panel, and threading it there would put the same field on all nine editors'
 * prop types whether or not they have a list to guard. Passing it through the
 * tree instead means a tenth choice editor inherits the guard rather than
 * having to remember to ask for it.
 *
 * The number is the server render's, and it does not follow submissions
 * arriving while the builder is open: it decides whether an edit needs a
 * warning, and "0 when the page loaded" is the only case where it does not.
 * A survey that collects its first response mid-edit is a reload away from
 * being guarded, and the results card says what happened either way.
 */
const CollectedAnswers = createContext(0);

export function CollectedAnswersProvider({
    count,
    children
}: {
    readonly count: number;
    readonly children: React.ReactNode;
}) {
    return (
        <CollectedAnswers.Provider value={count}>
            {children}
        </CollectedAnswers.Provider>
    );
}

/** Zero outside a provider, which is the unguarded case — a fresh draft. */
export function useCollectedAnswers(): number {
    return useContext(CollectedAnswers);
}
