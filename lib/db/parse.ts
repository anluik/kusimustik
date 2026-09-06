import { z } from "zod";

import { DbParseError } from "@/lib/db/errors";

/**
 * The read boundary. Every row leaving `lib/db/` goes through here, so the rest
 * of the codebase only ever sees values that satisfy the Phase 1 schemas.
 */
export function parseRow<S extends z.ZodType>(
    schema: S,
    value: unknown,
    what: string
): z.infer<S> {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    throw new DbParseError(
        `${what} does not match its schema:\n${z.prettifyError(result.error)}`,
        { cause: result.error }
    );
}

export function parseRows<S extends z.ZodType>(
    schema: S,
    values: readonly unknown[],
    what: string
): z.infer<S>[] {
    return values.map((value, index) =>
        parseRow(schema, value, `${what} [${index}]`)
    );
}

/** Postgres `timestamptz` as PostgREST renders it. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/**
 * A JSONB object column. Typed through `z.json()` rather than `unknown` so the
 * value is assignable to the generated `Json` type at the Supabase boundary
 * without a cast.
 */
export const JsonObjectSchema = z.record(z.string(), z.json());
export type JsonObject = z.infer<typeof JsonObjectSchema>;
