"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import type { QuestionId, SurveyId } from "@/domain/ids";
import type { SurveyEventType } from "@/lib/db/events";
import type { EventBatch, RunnerEvent } from "@/lib/runner/events";
import { MAX_EVENTS_PER_BATCH } from "@/lib/runner/events";

/**
 * The runner's interaction analytics (docs/DECISIONS.md 004).
 *
 * Three properties hold no matter what: it never blocks a respondent, it never
 * fails a submission, and it never learns who anyone is. Everything below is
 * inside a `try`/`catch` or a floating promise with a swallowed rejection, the
 * session id is a per-visit value in `sessionStorage` that is deliberately not
 * stored on `responses`, and the queue is dropped rather than retried when the
 * endpoint is unreachable.
 *
 * Events go to a Route Handler rather than a Server Action: `sendBeacon` needs
 * a plain endpoint, and Server Actions dispatch one at a time per client, so a
 * queued beacon would sit behind the submission it is describing.
 *
 * Only `MAX_EVENTS_PER_BATCH` types exist and each is emitted at most once per
 * question per visit, so the queue is bounded by the survey's length.
 */

const ENDPOINT = "/api/events";
const SESSION_KEY = "kusimustik:session";
const FLUSH_DEBOUNCE_MS = 2_000;

/** A question is "reached" once this much of its card has been on screen. */
const VIEW_RATIO = 0.4;

export type RunnerAnalytics = {
    /** Fired once, the first time the respondent touches any control. */
    readonly trackStart: () => void;
    /** Fired once per question, when it first holds an acceptable answer. */
    readonly trackAnswer: (questionId: QuestionId) => void;
    readonly trackSubmit: () => void;
    /** Attach to a question card; reports it as reached when it scrolls in. */
    readonly observe: (
        questionId: QuestionId
    ) => (node: Element | null) => void;
};

export function useRunnerAnalytics(surveyId: SurveyId): RunnerAnalytics {
    const queue = useRef<RunnerEvent[]>([]);
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const session = useRef<string | null>(null);
    /** Types and question ids already reported, so each fires exactly once. */
    const seen = useRef(new Set<string>());
    const submitted = useRef(false);
    /** Monotonic: immune to the clock changing under a long sitting. */
    const startedAt = useRef<number>(0);
    /** When each question was first reached, for its dwell time. */
    const reachedAt = useRef(new Map<QuestionId, number>());

    const send = useCallback(
        (events: readonly RunnerEvent[], viaBeacon: boolean) => {
            const sessionId = session.current;
            if (sessionId === null || events.length === 0) return;

            for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
                const batch = {
                    surveyId,
                    sessionId,
                    sentAtOffsetMs: elapsed(startedAt.current),
                    events: events.slice(i, i + MAX_EVENTS_PER_BATCH)
                } satisfies EventBatch;
                post(JSON.stringify(batch), viaBeacon);
            }
        },
        [surveyId]
    );

    const flush = useCallback(
        (viaBeacon: boolean) => {
            if (flushTimer.current !== null) {
                clearTimeout(flushTimer.current);
                flushTimer.current = null;
            }
            const pending = queue.current;
            queue.current = [];
            send(pending, viaBeacon);
        },
        [send]
    );

    const track = useCallback(
        (
            type: SurveyEventType,
            options: {
                readonly questionId?: QuestionId;
                readonly meta?: Record<string, string | number>;
                /** Send now rather than at the end of the debounce. */
                readonly immediate?: boolean;
            } = {}
        ) => {
            queue.current.push({
                type,
                ...(options.questionId !== undefined && {
                    questionId: options.questionId
                }),
                offsetMs: elapsed(startedAt.current),
                ...(options.meta !== undefined && { meta: options.meta })
            });

            if (options.immediate === true) {
                flush(false);
                return;
            }
            flushTimer.current ??= setTimeout(
                () => flush(false),
                FLUSH_DEBOUNCE_MS
            );
        },
        [flush]
    );

    /** True the first time it is called with a given key in this visit. */
    const once = useCallback((key: string): boolean => {
        if (seen.current.has(key)) return false;
        seen.current.add(key);
        return true;
    }, []);

    useEffect(() => {
        startedAt.current = now();
        session.current = visitSessionId();

        // Once per visit, and read from storage rather than a ref so React's
        // development-mode double mount does not count the visit twice.
        if (claimFirstView(surveyId)) {
            track("view", {
                meta: {
                    device: window.innerWidth < 768 ? "mobile" : "desktop",
                    referrer: document.referrer === "" ? "direct" : "link"
                }
            });
        }

        return () => flush(true);
    }, [surveyId, track, flush]);

    useEffect(() => {
        // A respondent who leaves the tab has abandoned the survey until they
        // come back; `visibilitychange` is the only signal a phone reliably
        // gives before the tab is discarded, so the abandon is filed there and
        // the queue goes out with `sendBeacon`, which survives the page.
        const leaving = () => {
            if (document.visibilityState !== "hidden") return;
            // `submitted` is read from storage as well as from the ref: the
            // session id survives a reload and an app switch, so a visit that
            // has already submitted must not file an abandon from a second
            // page load under the same id. The funnel excludes such a session
            // anyway (survey_funnel_totals), because a lost beacon or a second
            // device is not something a client can guard; this keeps the event
            // log itself honest.
            if (!hasSubmitted(surveyId, submitted) && once("abandon")) {
                track("abandon");
            }
            flush(true);
        };
        document.addEventListener("visibilitychange", leaving);
        window.addEventListener("pagehide", leaving);
        return () => {
            document.removeEventListener("visibilitychange", leaving);
            window.removeEventListener("pagehide", leaving);
        };
    }, [surveyId, track, flush, once]);

    const nodes = useRef(new Map<Element, QuestionId>());
    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;

        const io = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const id = nodes.current.get(entry.target);
                    if (id === undefined || !once(`view:${id}`)) continue;
                    reachedAt.current.set(id, now());
                    track("question_view", { questionId: id });
                }
            },
            { threshold: VIEW_RATIO }
        );
        observer.current = io;
        for (const node of nodes.current.keys()) io.observe(node);

        return () => {
            io.disconnect();
            observer.current = null;
        };
    }, [track, once]);

    const observe = useCallback(
        (questionId: QuestionId) => (node: Element | null) => {
            if (node === null) return;
            nodes.current.set(node, questionId);
            observer.current?.observe(node);
        },
        []
    );

    return useMemo(
        (): RunnerAnalytics => ({
            trackStart: () => {
                if (once("start")) track("start");
            },
            trackAnswer: questionId => {
                if (!once(`answer:${questionId}`)) return;
                const reached = reachedAt.current.get(questionId);
                track("question_answer", {
                    questionId,
                    ...(reached !== undefined && {
                        meta: { dwellMs: Math.round(now() - reached) }
                    })
                });
            },
            trackSubmit: () => {
                submitted.current = true;
                markSubmitted(surveyId);
                if (once("submit")) track("submit", { immediate: true });
            },
            observe
        }),
        [surveyId, track, once, observe]
    );
}

/**
 * Monotonic where the browser offers it. `performance.now()` does not move
 * when the system clock does, which is the whole point of sending offsets
 * rather than timestamps — see `lib/runner/events.ts`.
 */
function now(): number {
    return typeof performance === "undefined" ? Date.now() : performance.now();
}

function elapsed(from: number): number {
    return Math.max(0, Math.round(now() - from));
}

/** Per visit, never a user id, and never written to `responses`. */
function visitSessionId(): string | null {
    try {
        const existing = sessionStorage.getItem(SESSION_KEY);
        if (existing !== null) return existing;
        const fresh = crypto.randomUUID();
        sessionStorage.setItem(SESSION_KEY, fresh);
        return fresh;
    } catch {
        // No storage means no session id, and no session id means no events.
        // Analytics is the thing that gives way, never the survey.
        return null;
    }
}

/**
 * Whether this visit has already submitted, in memory or in storage.
 *
 * The ref answers within one page load; storage answers across the reload or
 * app switch that `sessionStorage` — and therefore the session id — survives.
 * No storage means no session id either (`visitSessionId`), so no events are
 * being sent and the answer does not matter.
 */
function hasSubmitted(
    surveyId: SurveyId,
    inMemory: { readonly current: boolean }
): boolean {
    if (inMemory.current) return true;
    try {
        return sessionStorage.getItem(submittedKey(surveyId)) !== null;
    } catch {
        return false;
    }
}

function markSubmitted(surveyId: SurveyId): void {
    try {
        sessionStorage.setItem(submittedKey(surveyId), "1");
    } catch {
        // As everywhere here: analytics gives way, the survey never does.
    }
}

function submittedKey(surveyId: SurveyId): string {
    return `kusimustik:submitted:${surveyId}`;
}

function claimFirstView(surveyId: SurveyId): boolean {
    try {
        const key = `kusimustik:viewed:${surveyId}`;
        if (sessionStorage.getItem(key) !== null) return false;
        sessionStorage.setItem(key, "1");
        return true;
    } catch {
        return false;
    }
}

function post(body: string, viaBeacon: boolean): void {
    try {
        if (viaBeacon && typeof navigator.sendBeacon === "function") {
            const blob = new Blob([body], { type: "application/json" });
            if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }
        // `keepalive` so a flush racing a navigation still leaves the tab.
        void fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true
        }).catch(() => {
            // Dropped on purpose: a retry queue would outlive the visit it is
            // describing, and no respondent is worse off for a lost event.
        });
    } catch {
        // As above.
    }
}
