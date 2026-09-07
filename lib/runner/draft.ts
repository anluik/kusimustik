import { z } from "zod";

import { AnswerValueSchema } from "@/domain/answer";
import { QuestionIdSchema } from "@/domain/ids";
import type { SurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import { isAnswerableElement } from "@/domain/question";
import type { AnswerDraft } from "@/lib/runner/validation";

/**
 * Partial progress, kept in `localStorage` so a refresh — or a phone killing
 * the tab to answer a call — does not lose what has been typed.
 *
 * Two rules make restoring safe. The key carries the survey's *version*, so a
 * definition edited and republished under a half-finished draft starts that
 * respondent afresh rather than restoring answers to questions that have
 * changed. And every restored entry is re-parsed and matched against the
 * question it claims to answer, so nothing that would fail on submit can get
 * back into the form.
 *
 * Everything here is best-effort: Safari's private mode throws on
 * `localStorage` access, and a respondent who has lost their draft should
 * still be able to answer the survey.
 */

/** A draft older than this is not worth restoring into a live survey. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const StoredDraftSchema = z.object({
    savedAt: z.int().positive(),
    answers: z.record(QuestionIdSchema, AnswerValueSchema)
});
type StoredDraft = z.infer<typeof StoredDraftSchema>;

export function draftStorageKey(surveyId: SurveyId, version: number): string {
    return `kusimustik:draft:${surveyId}:${version}`;
}

/**
 * The stored form of a draft. `null` answers are dropped rather than written:
 * "cleared" and "never touched" are the same thing to a respondent coming
 * back, and the shorter payload is the one that survives a quota limit.
 */
export function serialiseDraft(draft: AnswerDraft, now: number): string {
    const answers: StoredDraft["answers"] = {};
    for (const [id, value] of Object.entries(draft)) {
        if (value != null) answers[QuestionIdSchema.parse(id)] = value;
    }
    return JSON.stringify({ savedAt: now, answers } satisfies StoredDraft);
}

/**
 * Restores only what the current document can still use: an entry whose
 * question has been removed, whose type has changed under it, or whose
 * envelope no longer parses is dropped silently — a respondent cannot act on
 * any of those, and the alternative is a form that refuses to submit for a
 * reason they cannot see.
 */
export function deserialiseDraft(
    elements: readonly SurveyElement[],
    raw: string | null,
    now: number
): AnswerDraft {
    if (raw === null) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }

    const stored = StoredDraftSchema.safeParse(parsed);
    if (!stored.success) return {};
    if (now - stored.data.savedAt > MAX_AGE_MS) return {};

    const questions = new Map(
        elements.filter(isAnswerableElement).map(q => [q.id, q])
    );

    return Object.fromEntries(
        Object.entries(stored.data.answers).flatMap(([id, value]) => {
            const question = questions.get(QuestionIdSchema.parse(id));
            if (question === undefined) return [];
            return question.type === value.type ? [[id, value]] : [];
        })
    );
}

/* The browser wrappers. Deliberately separate from the pure functions above so
   the rules that matter are testable without a DOM. */

export function readDraft(
    elements: readonly SurveyElement[],
    key: string
): AnswerDraft {
    try {
        return deserialiseDraft(
            elements,
            localStorage.getItem(key),
            Date.now()
        );
    } catch {
        return {};
    }
}

export function writeDraft(key: string, draft: AnswerDraft): void {
    try {
        localStorage.setItem(key, serialiseDraft(draft, Date.now()));
    } catch {
        // Quota, or a browser that refuses storage. The answers are still in
        // memory; only the refresh-survives-it promise is lost.
    }
}

export function clearDraft(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // As above — nothing a respondent can do about it, and nothing broken.
    }
}
