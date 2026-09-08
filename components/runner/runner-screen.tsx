"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { AnswerValue } from "@/domain/answer";
import type { QuestionId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { Survey } from "@/domain/survey";
import { QuestionCard, cardId } from "@/components/runner/question-card";
import { RunnerNotice } from "@/components/runner/runner-notice";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { useRunnerAnalytics } from "@/lib/runner/analytics";
import {
    clearDraft,
    draftStorageKey,
    readDraft,
    writeDraft
} from "@/lib/runner/draft";
import type { RunnerActionError } from "@/lib/runner/errors";
import { submitResponseAction } from "@/lib/runner/actions";
import type { AnswerDraft, AnswerProblem } from "@/lib/runner/validation";
import {
    answerProgress,
    draftAnswer,
    validateAll,
    validateAnswer
} from "@/lib/runner/validation";
import { cn } from "@/lib/utils";

/**
 * The runner. All questions on one page (docs/PLAN.md Phase 6), which is the
 * shape a short survey wants and the one that lets a respondent see what they
 * are committing to before they start.
 *
 * Three things are worth knowing about the state here:
 *
 * - **The draft is what is on disk with what has been typed laid over it.**
 *   `localStorage` is read once `useMounted()` is true, because the server
 *   render has nothing to read and the first client render has to match it.
 * - **A problem is only shown once the respondent could have caused it.** Not
 *   on a question they have not reached — a page of red on arrival is not
 *   feedback — so a problem appears when they have touched that question, or
 *   when they have tried to submit.
 * - **Analytics never blocks.** Every call into `useRunnerAnalytics` returns
 *   immediately; nothing on the submit path waits for one.
 */

type Status =
    | { readonly kind: "editing" }
    | { readonly kind: "submitting" }
    | { readonly kind: "sent" }
    | { readonly kind: "failed"; readonly error: RunnerActionError };

export function RunnerScreen({
    survey,
    version
}: {
    readonly survey: Survey;
    /** Part of the draft's storage key, so a republished survey starts fresh. */
    readonly version: number;
}) {
    const t = useTranslations("RunnerShell");
    const errors = useTranslations("RunnerErrors");

    const analytics = useRunnerAnalytics(survey.id);
    const storageKey = useMemo(
        () => draftStorageKey(survey.id, version),
        [survey.id, version]
    );

    // What is on disk, read once the browser exists, and what has been typed
    // since, laid over it. Two values rather than one piece of state restored
    // in an effect: the server render has no `localStorage` to read, and
    // setting state from an effect to catch up would be a cascading render.
    // An edit of `null` in the overlay is how a cleared answer beats a stored
    // one — `draftAnswer` reads both as "no answer".
    const mounted = useMounted();
    const [edits, setEdits] = useState<AnswerDraft>({});
    const [touched, setTouched] = useState<ReadonlySet<QuestionId>>(new Set());
    const [attempted, setAttempted] = useState(false);
    const [status, setStatus] = useState<Status>({ kind: "editing" });

    const stored = useMemo(
        () => (mounted ? readDraft(survey.elements, storageKey) : {}),
        [mounted, survey.elements, storageKey]
    );
    const draft = useMemo(
        (): AnswerDraft => ({ ...stored, ...edits }),
        [stored, edits]
    );

    useEffect(() => {
        // Writing to an external system is what an effect is for. Skipped
        // before hydration, so the first pass cannot put `{}` over a draft
        // that is still on disk.
        if (!mounted || status.kind === "sent") return;
        writeDraft(storageKey, draft);
    }, [mounted, draft, storageKey, status.kind]);

    const questions = useMemo(
        () => survey.elements.filter(isAnswerableElement),
        [survey.elements]
    );
    const positions = useMemo(
        () =>
            new Map(
                questions.map((question, index) => [question.id, index + 1])
            ),
        [questions]
    );

    const progress = answerProgress(survey.elements, draft);
    const outstanding = validateAll(survey.elements, draft);

    const answer = useCallback(
        (questionId: QuestionId, value: AnswerValue | null) => {
            analytics.trackStart();
            setTouched(previous => new Set(previous).add(questionId));
            setEdits(previous => ({ ...previous, [questionId]: value }));
        },
        [analytics]
    );

    // Reported from an effect rather than from the change handler: an answer is
    // only *answered* once it satisfies its question, and a respondent typing
    // into a text field passes through several states that do not.
    useEffect(() => {
        for (const question of questions) {
            const value = draftAnswer(draft, question.id);
            if (value !== null && validateAnswer(question, value) === null) {
                analytics.trackAnswer(question.id);
            }
        }
    }, [draft, questions, analytics]);

    const problems = useMemo(() => {
        const shown = new Map<QuestionId, AnswerProblem>();
        for (const { question, problem } of outstanding) {
            if (attempted || touched.has(question.id)) {
                shown.set(question.id, problem);
            }
        }
        return shown;
    }, [outstanding, attempted, touched]);

    const submit = async () => {
        setAttempted(true);

        const first = outstanding[0];
        if (first !== undefined) {
            focusQuestion(first.question.id);
            return;
        }

        setStatus({ kind: "submitting" });
        analytics.trackSubmit();

        const result = await submitResponseAction({
            slug: survey.slug ?? "",
            answers: Object.fromEntries(
                Object.entries(draft).filter(([, value]) => value != null)
            )
        });

        if (result.ok) {
            clearDraft(storageKey);
            setStatus({ kind: "sent" });
            return;
        }
        setStatus({ kind: "failed", error: result.error });
    };

    if (status.kind === "sent") {
        return <RunnerNotice kind="thanks" surveyTitle={survey.title} />;
    }
    // Closed or deleted between the render and the submit. The answers are
    // gone either way, and there is nothing the respondent can retry.
    if (status.kind === "failed" && status.error === "closed") {
        return <RunnerNotice kind="closed" surveyTitle={survey.title} />;
    }
    if (status.kind === "failed" && status.error === "notFound") {
        return <RunnerNotice kind="notFound" />;
    }

    const busy = status.kind === "submitting";
    const blocked = attempted && outstanding.length > 0;

    return (
        <div className="flex min-h-svh flex-col">
            <RunnerHeader
                title={survey.title}
                progress={progress}
                label={t("progress", progress)}
                a11yLabel={t("progressLabel")}
            />

            <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-3 px-3.5 py-3.5">
                {survey.description !== undefined && (
                    <p className="text-[14px] leading-[1.35] text-muted-foreground">
                        {survey.description}
                    </p>
                )}

                {survey.elements.map(element => (
                    <QuestionCard
                        key={element.id}
                        element={element}
                        index={positions.get(element.id) ?? 0}
                        value={draftAnswer(draft, element.id)}
                        problem={problems.get(element.id) ?? null}
                        onChange={value => answer(element.id, value)}
                        cardRef={analytics.observe(element.id)}
                    />
                ))}

                <p className="text-[14px] leading-[1.35] text-muted-foreground">
                    {t("anonymous")}
                </p>
            </main>

            <footer className="sticky bottom-0 border-t bg-survey-background/95 backdrop-blur">
                <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-3.5 py-3">
                    {(blocked || status.kind === "failed") && (
                        <p
                            role="alert"
                            className="flex items-start gap-1.5 text-[14px] leading-[1.35] text-destructive"
                        >
                            <span
                                aria-hidden
                                className="mt-1.5 size-1.5 shrink-0 rounded-4xl bg-destructive"
                            />
                            {status.kind === "failed"
                                ? errors(status.error)
                                : errors("incomplete", {
                                      count: outstanding.length
                                  })}
                        </p>
                    )}
                    <Button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy}
                        className={cn(
                            "min-h-12 w-full rounded-survey text-[15px] font-medium",
                            "bg-survey-primary text-survey-primary-foreground hover:bg-survey-primary/90"
                        )}
                    >
                        {busy
                            ? t("submitting")
                            : status.kind === "failed"
                              ? errors("retry")
                              : t("submit")}
                    </Button>
                </div>
            </footer>
        </div>
    );
}

/**
 * DESIGN.md §4: a 52px header with a 3px progress rule, both pinned, so the
 * respondent always knows how much is left and never hunts for the action.
 */
function RunnerHeader({
    title,
    progress,
    label,
    a11yLabel
}: {
    readonly title: string;
    readonly progress: { readonly answered: number; readonly total: number };
    readonly label: string;
    readonly a11yLabel: string;
}) {
    // A dot decimal, always: `width: '39,6%'` is invalid CSS and is silently
    // dropped (DESIGN §7).
    const percent =
        progress.total === 0 ? 0 : (progress.answered / progress.total) * 100;

    return (
        <header className="sticky top-0 z-10 border-b bg-survey-background/95 backdrop-blur">
            <div className="mx-auto flex h-13 w-full max-w-[640px] items-center gap-3 px-3.5">
                <h1 className="min-w-0 flex-1 truncate text-[15px] leading-[1.4] font-medium">
                    {title}
                </h1>
                <span className="shrink-0 font-mono text-[11px] leading-none text-muted-foreground tabular-nums">
                    {label}
                </span>
            </div>
            <div
                role="progressbar"
                aria-label={a11yLabel}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.answered}
                className="h-[3px] w-full bg-ramp-track"
            >
                <div
                    className="h-full bg-survey-primary transition-[width] duration-200"
                    style={{ width: `${percent.toFixed(1)}%` }}
                />
            </div>
        </header>
    );
}

function focusQuestion(questionId: QuestionId): void {
    const card = document.getElementById(cardId(questionId));
    if (card === null) return;

    // Focus *before* the scroll, not after: `focus()` cancels a smooth scroll
    // that is already running, even with `preventScroll`, and the respondent
    // is then told something is wrong without being shown where.
    card.focus({ preventScroll: true });
    card.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "center"
    });
}
