import type { ActionResult } from "@/lib/actions/result";

/**
 * Wave comparison failure codes. Outside `actions.ts` for the reason
 * `lib/surveys/errors.ts` is: a `"use server"` module may only export async
 * functions, and the client components that render these must not import the
 * actions' server dependencies.
 *
 * Each maps to a `Waves.errors.*` key in the message catalogue.
 */
export const COMPARISON_ACTION_ERRORS = [
    /** The input did not survive re-parsing, or named a wave outside the group. */
    "invalidInput",
    /** Deleted, or never the caller's — RLS makes those indistinguishable. */
    "notFound",
    /** Saved from somewhere else in between; the editor reloads. */
    "conflict",
    /**
     * A changed row breaks the matching rules — two types, two scale lengths.
     * The editor only offers legal choices, so this is a definition that
     * changed under an open editor, and it too reloads.
     */
    "refused",
    "failed"
] as const;

export type ComparisonActionError = (typeof COMPARISON_ACTION_ERRORS)[number];

export type ComparisonActionResult<TData = undefined> = ActionResult<
    TData,
    ComparisonActionError
>;
