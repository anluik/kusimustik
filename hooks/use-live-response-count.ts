"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
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
 *   optimisation, not the security boundary. That authorisation has to be in
 *   place *before* the channel joins — see `setAuth` below.
 * - **It never breaks the page.** No websocket, a revoked session, a browser
 *   that refuses one: the count simply stays where the server put it. A live
 *   figure is a nicety, and a results page that fails to render because a
 *   subscription could not open would be a poor trade. It is not, however,
 *   allowed to fail *quietly*: that is what let it stay broken.
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
        let channel: RealtimeChannel | null = null;

        void (async () => {
            /**
             * `subscribe()` reads the socket's access token *synchronously*
             * and puts it in the join frame. The browser client resolves its
             * session from cookies asynchronously, so a channel opened in a
             * mount effect joins before that has happened and arrives at the
             * server as `anon` — which holds `INSERT` on `responses` and
             * nothing else, so Realtime cannot even resolve the filter column
             * and answers `"invalid column for filter survey_id"`. Awaiting
             * `setAuth()` first is what makes the join the owner's.
             *
             * No argument: supabase-js configures an `accessToken` callback on
             * the realtime client, and passing a token explicitly would switch
             * it into manual mode and stop it refreshing on heartbeat.
             */
            try {
                await db.realtime.setAuth();
            } catch {
                // An unreadable session is the signed-out case, and the count
                // the server rendered is still correct. Joining anyway would
                // only reproduce the failure this await exists to avoid.
                return;
            }
            if (cancelled) return;

            channel = db
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
                .subscribe(status => {
                    // A subscription that never opens looks exactly like a
                    // survey nobody is answering, which is how this went
                    // unnoticed through a green suite and a review. It still
                    // must not disturb the page, so it says so where a
                    // developer will see it and a respondent never will.
                    if (
                        process.env.NODE_ENV !== "production" &&
                        (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
                    ) {
                        console.warn(
                            `[live count] responses:${surveyId} did not subscribe (${status}); the figure will not move until the page is reloaded.`
                        );
                    }
                });
        })();

        return () => {
            cancelled = true;
            if (channel !== null) void db.removeChannel(channel);
        };
    }, [surveyId]);

    return initialCount + extra;
}
