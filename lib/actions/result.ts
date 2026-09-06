import { unstable_rethrow } from "next/navigation";

/**
 * The envelope every Server Action returns. Actions do not throw at the
 * client: an expected failure is a value the caller renders, and the error is
 * a *code*, never a sentence — the copy for it lives in the message catalogue
 * like every other string.
 */
export type ActionResult<TData, TError extends string> =
    | { readonly ok: true; readonly data: TData }
    | { readonly ok: false; readonly error: TError };

export function ok<TData>(data: TData): { readonly ok: true; data: TData } {
    return { ok: true, data };
}

export function failed<TError extends string>(
    error: TError
): { readonly ok: false; readonly error: TError } {
    return { ok: false, error };
}

/**
 * Wraps an action body so an unexpected throw becomes `fallback` rather than a
 * client-side crash.
 *
 * `unstable_rethrow` must come first in the catch: `redirect()`,
 * `permanentRedirect()` and `notFound()` are all implemented as throws, and a
 * catch-all that swallows one produces a navigation that silently does not
 * happen. See docs/DECISIONS.md 006.
 */
export async function runAction<TData, TError extends string>(
    fallback: TError,
    body: () => Promise<ActionResult<TData, TError>>
): Promise<ActionResult<TData, TError>> {
    try {
        return await body();
    } catch (error) {
        unstable_rethrow(error);
        console.error(error);
        return failed(fallback);
    }
}
