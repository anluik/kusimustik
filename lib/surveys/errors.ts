import type { ActionResult } from "@/lib/actions/result";

/**
 * Survey CRUD failure codes. They live outside `actions.ts` because a
 * `"use server"` module may only export async functions — a `const` there is a
 * build error — and because the dialogs that render them are client components
 * that must not pull the actions' server imports into the browser.
 *
 * Each maps to a `Surveys.errors.*` key in the message catalogue. Nothing here
 * is copy.
 */
export const SURVEY_ACTION_ERRORS = [
    /** The title or id did not survive re-parsing on the server. */
    "invalidInput",
    /** Deleted, or never the caller's — RLS makes those indistinguishable. */
    "notFound",
    /** Someone else saved in between; the caller refetches rather than wins. */
    "conflict",
    /** Publishing a survey with nothing to answer. */
    "noQuestions",
    "failed"
] as const;

export type SurveyActionError = (typeof SURVEY_ACTION_ERRORS)[number];

export type SurveyActionResult<TData = undefined> = ActionResult<
    TData,
    SurveyActionError
>;
