import type { ActionResult } from "@/lib/actions/result";

/**
 * Account failure codes, outside `actions.ts` for the same two reasons the
 * survey ones are: a `"use server"` module may only export async functions,
 * and the form that renders these is a client component that must not pull the
 * action's server imports into the browser.
 *
 * Each maps to a `Settings.account.errors.*` key. Nothing here is copy.
 */
export const ACCOUNT_ACTION_ERRORS = [
    /** The name did not survive re-parsing on the server. */
    "invalidInput",
    "failed"
] as const;

export type AccountActionError = (typeof ACCOUNT_ACTION_ERRORS)[number];

export type AccountActionResult<TData = undefined> = ActionResult<
    TData,
    AccountActionError
>;
