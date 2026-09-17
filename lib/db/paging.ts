import type { PostgrestResponse } from "@supabase/supabase-js";

import { unwrap } from "@/lib/db/errors";

/**
 * Reads every row of a query, a page at a time.
 *
 * PostgREST returns at most `max_rows` rows per request (1000, locally and on
 * the hosted default) and says nothing when it stops there, so a read that
 * simply awaits a `select()` is a read of an arbitrary first thousand rows.
 * That summarised every survey past about a thousand answers from a subset of
 * them, silently (docs/DECISIONS.md 035).
 *
 * The page size is a request, not a promise: the loop advances by the rows that
 * actually came back and stops only on an empty page, so a server configured
 * with a smaller cap than `PAGE_SIZE` costs requests rather than rows.
 *
 * `page` must order on something unique, or offsets are meaningless between
 * requests. Offsets are still not a snapshot: a row inserted *ahead* of the
 * cursor while this runs is read twice and a row deleted behind it shifts the
 * rest, so callers order on something that only grows — a submission time, an
 * insertion time — and treat what they read as keyed, not counted.
 */
export const PAGE_SIZE = 1000;

export async function readAllPages<Row>(
    context: string,
    page: (from: number, to: number) => PromiseLike<PostgrestResponse<Row>>
): Promise<Row[]> {
    const rows: Row[] = [];
    for (let index = 0; ; index += 1) {
        const from = rows.length;
        const chunk = unwrap(
            `${context} [page ${index + 1}]`,
            await page(from, from + PAGE_SIZE - 1)
        );
        if (chunk.length === 0) return rows;
        rows.push(...chunk);
    }
}
