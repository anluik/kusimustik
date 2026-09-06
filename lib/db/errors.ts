import type { PostgrestSingleResponse } from "@supabase/supabase-js";

/**
 * Repository errors. Repository functions throw; the Server Action wrapper maps
 * them to the `{ ok: false, error }` envelope the client sees. Nothing in here
 * is respondent- or owner-facing copy — messages are for logs and stack traces.
 */

export class DbError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}

/** A row came back that its schema rejects. Always a bug or a bad migration. */
export class DbParseError extends DbError {}

/** The row was not found, or RLS hid it — indistinguishable by design. */
export class DbNotFoundError extends DbError {}

/**
 * A unique index rejected the write. The one caller that cares is slug
 * assignment, which responds by proposing a different one; everything else
 * treats it as the bug it usually is.
 */
export class DbUniqueViolationError extends DbError {}

/**
 * An optimistic-concurrency check failed: the survey moved on since the version
 * the caller read. The caller refetches and warns; see docs/DECISIONS.md 001.
 */
export class DbConflictError extends DbError {}

/** Postgres `unique_violation`, forwarded verbatim by PostgREST. */
const UNIQUE_VIOLATION = "23505";

/**
 * Turns a PostgREST result into its data or a thrown `DbError`. `maybeSingle()`
 * results come back as `T | null`, which callers handle themselves — a missing
 * row is usually not an error.
 *
 * Typed against Supabase's own response type rather than a structural union:
 * inference against a hand-written `{ data } | { error }` union silently
 * collapses to `never` when the call is written inline.
 */
export function unwrap<T>(
    context: string,
    result: PostgrestSingleResponse<T>
): T {
    if (result.error !== null) {
        const message = `${context}: ${result.error.message} (${result.error.code})`;
        throw result.error.code === UNIQUE_VIOLATION
            ? new DbUniqueViolationError(message, { cause: result.error })
            : new DbError(message, { cause: result.error });
    }
    return result.data;
}
