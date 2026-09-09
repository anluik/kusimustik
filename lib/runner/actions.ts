"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { buildAnswerSchema } from "@/domain/answer";
import { isAnswerableElement } from "@/domain/question";
import { LOCALES, SurveySlugSchema } from "@/domain/survey";
import { failed, ok, runAction } from "@/lib/actions/result";
import type { SubmittedAnswer } from "@/lib/db/responses";
import { submitResponse } from "@/lib/db/responses";
import { getRunnerSurveyBySlug } from "@/lib/db/surveys";
import type { RunnerActionResult } from "@/lib/runner/errors";
import { SubmitGuardSchema, looksAutomated } from "@/lib/runner/honeypot";
import { allowsWrite, clientIdentifier } from "@/lib/runner/throttle";
import { createPublicDb } from "@/lib/supabase/public";

/**
 * The respondent's submission.
 *
 * A Server Action is a public POST endpoint reachable without the form, so
 * nothing the client sent about the *survey* is trusted: the definition is
 * re-read by slug and every answer re-parsed through `buildAnswerSchema`
 * against the question as the server sees it. The client's own validation is
 * a UX nicety; this is the validation that counts.
 *
 * It runs on the anonymous client deliberately, even for a signed-in owner
 * testing their own link, so the RLS policies exercised are a respondent's.
 * That is also what refuses a submission to a survey that is not published,
 * whatever this code believes.
 *
 * Phase 9 put three gates in front of all of that, in cost order: the honeypot
 * and the timing floor, which are free and answer without touching the
 * database, then the Postgres rate limiter, which costs one round trip. All
 * three run before a single answer is parsed — there is no point validating a
 * submission that is not going to be stored.
 */

const SubmitInputSchema = SubmitGuardSchema.extend({
    slug: SurveySlugSchema,
    /**
     * The language the respondent read the survey in. Optional because it is
     * a claim rather than a fact — an older tab, or a direct POST, may not
     * send one — and it is checked against what the survey is actually
     * offered in before it is stored.
     */
    locale: z.literal(LOCALES).optional(),
    /**
     * Keyed by question id. Values are `unknown` on purpose — they are parsed
     * question by question below, where the schema that applies is known.
     */
    answers: z.record(z.uuid(), z.unknown())
});
export type SubmitResponseInput = z.input<typeof SubmitInputSchema>;

export async function submitResponseAction(
    input: SubmitResponseInput
): Promise<RunnerActionResult> {
    return runAction("failed", async () => {
        const parsed = SubmitInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidAnswers");

        // Free, and no database behind them. A filled honeypot or a submission
        // that beat the floor never reaches the limiter, so a script cannot
        // spend someone else's allowance by failing these.
        if (looksAutomated(parsed.data)) return failed("blocked");

        const db = createPublicDb();

        // Keyed on the slug rather than the survey id: it identifies the same
        // survey and it is already in hand, so a caller who is over the
        // threshold is turned away without a read.
        const allowed = await allowsWrite(db, {
            bucket: "submit",
            scope: parsed.data.slug,
            client: clientIdentifier(await headers())
        });
        if (!allowed) return failed("rateLimited");

        const found = await getRunnerSurveyBySlug(db, parsed.data.slug);
        if (found === null) return failed("notFound");
        if (found.survey.status !== "published") return failed("closed");
        const { survey } = found;

        // Nothing to answer means nothing to submit. The page renders a notice
        // rather than a form for this, so reaching here is a stale tab or a
        // direct POST; either way an empty response would only inflate the
        // owner's count. `closed` is the honest code — this survey is not
        // collecting — and it is the notice the page would have shown.
        if (!survey.elements.some(isAnswerableElement)) return failed("closed");

        const answers: SubmittedAnswer[] = [];
        for (const element of survey.elements) {
            if (!isAnswerableElement(element)) continue;

            const submitted = buildAnswerSchema(element).safeParse(
                parsed.data.answers[element.id] ?? null
            );
            if (!submitted.success) return failed("invalidAnswers");
            // A skipped question has no row at all, which is what makes the
            // skip count computable later (docs/DECISIONS.md 007).
            if (submitted.data !== null) {
                answers.push({
                    questionId: element.id,
                    value: submitted.data
                });
            }
        }

        // Answers to questions that have left the document since the page
        // loaded are simply not in the loop above. There is nowhere to store
        // one — the projection row is tombstoned and the trigger on `answers`
        // refuses it — and losing the whole submission over it would be worse
        // for the respondent than losing the one answer.

        // Which language this response was answered in. The client's claim is
        // only believed for a language the survey is offered in — it is the
        // same untrusted POST body every answer above was re-parsed from — and
        // anything else files the response under the language the survey is
        // written in, which is what the respondent would have been served.
        const answeredIn =
            parsed.data.locale !== undefined &&
            survey.locales.includes(parsed.data.locale)
                ? parsed.data.locale
                : survey.locale;

        await submitResponse(db, {
            surveyId: survey.id,
            answers,
            locale: answeredIn
        });

        // Nothing is revalidated: the owner's results page reads its own data,
        // and a respondent has no cached page of ours to refresh.
        return ok(undefined);
    });
}
