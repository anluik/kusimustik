import type { ActionResult } from "@/lib/actions/result";

/**
 * Submission failure codes. Outside `actions.ts` because a `"use server"`
 * module may only export async functions, and because the runner component
 * that renders them is a client component that must not pull the action's
 * server imports into a respondent's phone.
 *
 * Each maps to a `RunnerErrors.*` key. Nothing here is copy.
 */
export const RUNNER_ACTION_ERRORS = [
    /** The link is wrong, or the survey has been deleted. */
    "notFound",
    /** It exists but has stopped collecting — closed since the page loaded. */
    "closed",
    /**
     * The server re-validated and disagreed. The runner validates the same
     * schemas before it submits, so this means a stale definition or a request
     * that did not come from the form.
     */
    "invalidAnswers",
    "failed"
] as const;

export type RunnerActionError = (typeof RUNNER_ACTION_ERRORS)[number];

export type RunnerActionResult<TData = undefined> = ActionResult<
    TData,
    RunnerActionError
>;
