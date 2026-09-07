"use server";

import { z } from "zod";

import { buildAnswerSchema } from "@/domain/answer";
import { isAnswerableElement } from "@/domain/question";
import { SurveySlugSchema } from "@/domain/survey";
import { failed, ok, runAction } from "@/lib/actions/result";
import type { SubmittedAnswer } from "@/lib/db/responses";
import { submitResponse } from "@/lib/db/responses";
import { getRunnerSurveyBySlug } from "@/lib/db/surveys";
import type { RunnerActionResult } from "@/lib/runner/errors";
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
 */

const SubmitInputSchema = z.object({
    slug: SurveySlugSchema,
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

        const db = createPublicDb();
        const found = await getRunnerSurveyBySlug(db, parsed.data.slug);
        if (found === null) return failed("notFound");
        if (found.survey.status !== "published") return failed("closed");
        const { survey } = found;

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

        await submitResponse(db, {
            surveyId: survey.id,
            answers,
            locale: survey.locale
        });

        // Nothing is revalidated: the owner's results page reads its own data,
        // and a respondent has no cached page of ours to refresh.
        return ok(undefined);
    });
}
