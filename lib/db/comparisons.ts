import { z } from "zod";

import { ComparisonDocumentSchema } from "@/domain/comparison";
import type { ComparisonDocument } from "@/domain/comparison";
import type { ComparisonId, SurveyId, WaveGroupId } from "@/domain/ids";
import {
    ComparisonIdSchema,
    SurveyIdSchema,
    WaveGroupIdSchema
} from "@/domain/ids";
import { DbConflictError, DbNotFoundError, unwrap } from "@/lib/db/errors";
import { readAllPages } from "@/lib/db/paging";
import { TimestampSchema, parseRow, parseRows } from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * Saved wave comparisons (docs/DECISIONS.md 035).
 *
 * A comparison is written whole — `create_comparison` and `save_comparison`
 * are the only writers of its waves, rows and matches — and read whole, as a
 * `ComparisonDocument`. Deleting it is the one other write. The document's
 * waves come back oldest first, which is the order everything that draws a
 * comparison reads left to right.
 */

const COMPARISON_COLUMNS =
    "id, wave_group_id, name, version, created_at, updated_at";

/** The SQLSTATE `save_comparison` raises on a stale version. */
const VERSION_CONFLICT = "KM409";

export const ComparisonRecordSchema = z.object({
    id: ComparisonIdSchema,
    waveGroupId: WaveGroupIdSchema,
    /** The matching editor's optimistic-concurrency token. */
    version: z.int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    document: ComparisonDocumentSchema
});
export type ComparisonRecord = z.infer<typeof ComparisonRecordSchema>;

/** What the group's comparison list shows of one. */
export const ComparisonSummarySchema = z.object({
    id: ComparisonIdSchema,
    waveGroupId: WaveGroupIdSchema,
    name: z.string().min(1),
    version: z.int().nonnegative(),
    updatedAt: TimestampSchema,
    /** Oldest first. */
    surveyIds: z.array(SurveyIdSchema)
});
export type ComparisonSummary = z.infer<typeof ComparisonSummarySchema>;

type ComparisonRow = {
    id: string;
    wave_group_id: string;
    name: string;
    version: number;
    created_at: string;
    updated_at: string;
};

type MemberRow = {
    comparison_id: string;
    survey_id: string;
    survey: { created_at: string } | null;
};

/** Each comparison's waves, oldest first. */
async function readMembers(
    db: Db,
    ids: readonly string[],
    what: string
): Promise<ReadonlyMap<string, string[]>> {
    const rows: MemberRow[] = unwrap(
        `${what} waves`,
        await db
            .from("wave_comparison_waves")
            .select("comparison_id, survey_id, survey:surveys(created_at)")
            .in("comparison_id", [...ids])
    );

    const byComparison = new Map<string, MemberRow[]>();
    for (const row of rows) {
        byComparison.set(row.comparison_id, [
            ...(byComparison.get(row.comparison_id) ?? []),
            row
        ]);
    }
    return new Map(
        [...byComparison].map(([id, members]) => [
            id,
            members
                .sort((a, b) =>
                    (a.survey?.created_at ?? "").localeCompare(
                        b.survey?.created_at ?? ""
                    )
                )
                .map(member => member.survey_id)
        ])
    );
}

/** Newest-edited first. RLS scopes it to the caller's own comparisons. */
export async function listComparisons(
    db: Db,
    waveGroupId: WaveGroupId
): Promise<ComparisonSummary[]> {
    const what = `listComparisons(${waveGroupId})`;
    const comparisons: ComparisonRow[] = unwrap(
        what,
        await db
            .from("wave_comparisons")
            .select(COMPARISON_COLUMNS)
            .eq("wave_group_id", waveGroupId)
            .order("updated_at", { ascending: false })
    );
    if (comparisons.length === 0) return [];

    const ids = comparisons.map(comparison => comparison.id);
    const members = await readMembers(db, ids, what);
    return parseRows(
        ComparisonSummarySchema,
        comparisons.map(comparison => ({
            id: comparison.id,
            waveGroupId: comparison.wave_group_id,
            name: comparison.name,
            version: comparison.version,
            updatedAt: comparison.updated_at,
            surveyIds: members.get(comparison.id) ?? []
        })),
        what
    );
}

/** The whole comparison, or null when it is not the caller's. */
export async function getComparison(
    db: Db,
    id: ComparisonId
): Promise<ComparisonRecord | null> {
    const what = `getComparison(${id})`;
    const comparison: ComparisonRow | null = unwrap(
        what,
        await db
            .from("wave_comparisons")
            .select(COMPARISON_COLUMNS)
            .eq("id", id)
            .maybeSingle()
    );
    if (comparison === null) return null;

    const surveyIds = (await readMembers(db, [id], what)).get(id) ?? [];
    const order = new Map(
        surveyIds.map((surveyId, index) => [surveyId, index])
    );

    const rows = await readAllPages(`${what} rows`, (from, to) =>
        db
            .from("wave_comparison_rows")
            .select("id")
            .eq("comparison_id", id)
            .order("id", { ascending: true })
            .range(from, to)
    );
    const matches = await readAllPages(`${what} matches`, (from, to) =>
        db
            .from("wave_comparison_matches")
            .select("row_id, survey_id, question_id")
            .eq("comparison_id", id)
            .order("row_id", { ascending: true })
            .order("survey_id", { ascending: true })
            .range(from, to)
    );

    return parseRow(
        ComparisonRecordSchema,
        {
            id: comparison.id,
            waveGroupId: comparison.wave_group_id,
            version: comparison.version,
            createdAt: comparison.created_at,
            updatedAt: comparison.updated_at,
            document: {
                name: comparison.name,
                surveyIds,
                rows: rows.map(row => ({
                    id: row.id,
                    matches: matches
                        .filter(match => match.row_id === row.id)
                        .sort(
                            (a, b) =>
                                (order.get(a.survey_id) ?? 0) -
                                (order.get(b.survey_id) ?? 0)
                        )
                        .map(match => ({
                            surveyId: match.survey_id,
                            questionId: match.question_id
                        }))
                }))
            }
        },
        what
    );
}

/** The document as the two RPCs take it. */
function rpcRows(document: ComparisonDocument) {
    return document.rows.map(row => ({
        id: row.id,
        matches: row.matches.map(match => ({
            surveyId: match.surveyId,
            questionId: match.questionId
        }))
    }));
}

export async function createComparison(
    db: Db,
    input: {
        readonly waveGroupId: WaveGroupId;
        readonly document: ComparisonDocument;
    }
): Promise<ComparisonId> {
    const document = ComparisonDocumentSchema.parse(input.document);
    const id = unwrap(
        `createComparison(${input.waveGroupId})`,
        await db.rpc("create_comparison", {
            p_wave_group_id: input.waveGroupId,
            p_name: document.name,
            p_survey_ids: [...document.surveyIds],
            p_rows: rpcRows(document)
        })
    );
    return ComparisonIdSchema.parse(id);
}

/**
 * Replaces the comparison's waves and rows, and returns the new version.
 *
 * Matches whose question or wave has vanished since the caller read them are
 * dropped by the database rather than refused; see `save_comparison`.
 */
export async function saveComparison(
    db: Db,
    id: ComparisonId,
    expectedVersion: number,
    input: ComparisonDocument
): Promise<number> {
    const document = ComparisonDocumentSchema.parse(input);
    const what = `saveComparison(${id})`;
    const result = await db.rpc("save_comparison", {
        p_comparison_id: id,
        p_expected_version: expectedVersion,
        p_name: document.name,
        p_survey_ids: [...document.surveyIds],
        p_rows: rpcRows(document)
    });

    if (result.error?.code === VERSION_CONFLICT) {
        throw new DbConflictError(`${what}: ${result.error.message}`, {
            cause: result.error
        });
    }
    // The generated type says `number`; a comparison the caller cannot see
    // comes back as SQL null all the same.
    const version: unknown = unwrap(what, result);
    if (version === null) {
        throw new DbNotFoundError(
            `comparison ${id} does not exist or is not yours`
        );
    }
    return parseRow(z.int().positive(), version, what);
}

export async function deleteComparison(
    db: Db,
    id: ComparisonId
): Promise<void> {
    const deleted = unwrap(
        `deleteComparison(${id})`,
        await db
            .from("wave_comparisons")
            .delete()
            .eq("id", id)
            .select("id")
            .maybeSingle()
    );
    if (deleted === null) {
        throw new DbNotFoundError(
            `comparison ${id} does not exist or is not yours`
        );
    }
}

/**
 * How many comparisons each of the caller's surveys is a wave of — what the
 * survey list's delete dialog says before a wave is removed from them. One
 * read for the whole list; RLS scopes it to the caller's own comparisons.
 */
export async function listComparisonCounts(
    db: Db
): Promise<ReadonlyMap<SurveyId, number>> {
    const rows = await readAllPages("listComparisonCounts", (from, to) =>
        db
            .from("wave_comparison_waves")
            .select("comparison_id, survey_id")
            .order("comparison_id", { ascending: true })
            .order("survey_id", { ascending: true })
            .range(from, to)
    );

    const counts = new Map<SurveyId, number>();
    for (const row of parseRows(
        z.object({ survey_id: SurveyIdSchema }),
        rows,
        "listComparisonCounts"
    )) {
        counts.set(row.survey_id, (counts.get(row.survey_id) ?? 0) + 1);
    }
    return counts;
}
