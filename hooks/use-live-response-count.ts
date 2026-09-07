"use client";

import { useEffect, useState } from "react";

import type { SurveyId } from "@/domain/ids";
import { createBrowserDb } from "@/lib/supabase/browser";

/**
 * The response count, kept live while the owner watches it.
 *
 * The server render supplies the number; this only ever moves it forward as
 * submissions land. Three properties are deliberate:
 *
 * - **It cannot go backwards or wrong.** A submitted response is immutable and
 *   has no UPDATE policy, so INSERT is the only event that matters and the
 *   count is `initial + inserts seen`. Nothing here refetches, so it cannot
 *   disagree with the page around it — a reload is what reconciles them.
 * - **It is authorised as the owner.** Realtime applies the RLS policy on
 *   `responses` to each subscriber, so the filter below is a bandwidth
 *   optimisation, not the security boundary.
 * - **It never breaks the page.** No websocket, a revoked session, a browser
 *   that refuses one: the count simply stays where the server put it. A live
 *   figure is a nicety, and a results page that fails to render because a
 *   subscription could not open would be a poor trade.
 */
export function useLiveResponseCount(
    surveyId: SurveyId,
    initialCount: number
): number {
    const [extra, setExtra] = useState(0);

    // A new server render brings a fresh count that already includes whatever
    // was counted here, so the local delta starts again rather than double
    // counting what it has already seen.
    const [countedFrom, setCountedFrom] = useState(initialCount);
    if (countedFrom !== initialCount) {
        setCountedFrom(initialCount);
        setExtra(0);
    }

    useEffect(() => {
        const db = createBrowserDb();
        let cancelled = false;

        const channel = db
            .channel(`responses:${surveyId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "responses",
                    filter: `survey_id=eq.${surveyId}`
                },
                () => {
                    if (!cancelled) setExtra(seen => seen + 1);
                }
            )
            .subscribe();

        return () => {
            cancelled = true;
            void db.removeChannel(channel);
        };
    }, [surveyId]);

    return initialCount + extra;
}
