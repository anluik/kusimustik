"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
    ComparisonDocumentSchema,
    ComparisonNameSchema,
    NewComparisonSchema,
    suggestMatches
} from "@/domain/comparison";
import type { ComparisonDocument, ComparisonWave } from "@/domain/comparison";
import type { ComparisonId, QuestionId } from "@/domain/ids";
import { ComparisonIdSchema, WaveGroupIdSchema } from "@/domain/ids";
import { failed, ok, runAction } from "@/lib/actions/result";
import { requireSessionUser } from "@/lib/auth/session";
import type {
    ComparisonActionError,
    ComparisonActionResult
} from "@/lib/comparisons/errors";
import { checkComparisonSave } from "@/lib/comparisons/validate";
import {
    createComparison,
    deleteComparison,
    getComparison,
    saveComparison
} from "@/lib/db/comparisons";
import type { ComparisonRecord } from "@/lib/db/comparisons";
import { DbConflictError, DbNotFoundError } from "@/lib/db/errors";
import type { Db } from "@/lib/db/types";
import { listRemovedQuestions, listWaveGroup } from "@/lib/db/waves";
import { createServerDb } from "@/lib/supabase/server";

/**
 * Saved wave comparisons (docs/DECISIONS.md 035).
 *
 * Each action is a public POST endpoint and re-checks the session and
 * re-parses its input itself. Ownership is RLS's: the request-scoped client
 * carries the owner's identity, so a comparison or a wave group belonging to
 * someone else is simply not there.
 *
 * Suggestions are the domain's (`suggestMatches`), and pure — the editor runs
 * them itself and saves the result, which comes back through
 * `saveComparisonAction` and is checked like any other edit. Only creating a
 * comparison suggests on the server, because there is no editor yet.
 */

const toWaves = (
    waves: Awaited<ReturnType<typeof listWaveGroup>>
): ComparisonWave[] =>
    waves.map(wave => ({
        surveyId: wave.survey.id,
        elements: wave.survey.elements
    }));

const CreateInputSchema = NewComparisonSchema.extend({
    waveGroupId: WaveGroupIdSchema
});
export type CreateComparisonInput = z.input<typeof CreateInputSchema>;

export async function createComparisonAction(
    input: CreateComparisonInput
): Promise<ComparisonActionResult<{ comparisonId: ComparisonId }>> {
    return runAction("failed", async () => {
        await requireSessionUser();
        const parsed = CreateInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        const group = toWaves(await listWaveGroup(db, parsed.data.waveGroupId));
        const chosen = new Set(parsed.data.surveyIds);
        const waves = group.filter(wave => chosen.has(wave.surveyId));
        // A wave the caller cannot see, or one from another group.
        if (waves.length !== chosen.size) return failed("invalidInput");

        const document: ComparisonDocument = {
            name: parsed.data.name,
            surveyIds: waves.map(wave => wave.surveyId),
            // Starting rows the owner changes in the matching editor.
            rows: suggestMatches({ waves, rows: [], scope: { kind: "all" } })
        };

        const comparisonId = await createComparison(db, {
            waveGroupId: parsed.data.waveGroupId,
            document
        });
        refresh();
        return ok({ comparisonId });
    });
}

const SaveInputSchema = z.object({
    comparisonId: ComparisonIdSchema,
    expectedVersion: z.int().nonnegative(),
    document: ComparisonDocumentSchema
});
export type SaveComparisonInput = z.input<typeof SaveInputSchema>;

/**
 * The matching editor's autosave. Deliberately does not revalidate — it fires
 * while the owner is working, as the builder's does; the result page reads
 * fresh on the way back.
 */
export async function saveComparisonAction(
    input: SaveComparisonInput
): Promise<ComparisonActionResult<{ version: number }>> {
    return runAction("failed", async () => {
        await requireSessionUser();
        const parsed = SaveInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        const found = await loadForWrite(db, parsed.data.comparisonId);
        if (!found.ok) return found;

        return save(
            db,
            found.record,
            parsed.data.expectedVersion,
            parsed.data.document
        );
    });
}

const RenameInputSchema = z.object({
    comparisonId: ComparisonIdSchema,
    name: ComparisonNameSchema
});

/**
 * Renaming from the list goes through the same versioned save, so an editor
 * open in another tab sees a conflict instead of writing the old name back.
 */
export async function renameComparisonAction(input: {
    comparisonId: string;
    name: string;
}): Promise<ComparisonActionResult> {
    return runAction("failed", async () => {
        await requireSessionUser();
        const parsed = RenameInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        const found = await loadForWrite(db, parsed.data.comparisonId);
        if (!found.ok) return found;

        const { record } = found;
        const result = await save(db, record, record.version, {
            ...record.document,
            name: parsed.data.name
        });
        if (!result.ok) return result;

        refresh();
        return ok(undefined);
    });
}

export async function deleteComparisonAction(input: {
    comparisonId: string;
}): Promise<ComparisonActionResult> {
    return runAction("failed", async () => {
        await requireSessionUser();
        const parsed = z
            .object({ comparisonId: ComparisonIdSchema })
            .safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        try {
            await deleteComparison(db, parsed.data.comparisonId);
        } catch (error) {
            if (error instanceof DbNotFoundError) return failed("notFound");
            throw error;
        }

        refresh();
        return ok(undefined);
    });
}

async function loadForWrite(
    db: Db,
    id: ComparisonId
): Promise<
    | { readonly ok: true; readonly record: ComparisonRecord }
    | { readonly ok: false; readonly error: ComparisonActionError }
> {
    const record = await getComparison(db, id);
    return record === null
        ? { ok: false, error: "notFound" }
        : { ok: true, record };
}

async function save(
    db: Db,
    record: ComparisonRecord,
    expectedVersion: number,
    next: ComparisonDocument
): Promise<ComparisonActionResult<{ version: number }>> {
    const waves = toWaves(await listWaveGroup(db, record.waveGroupId));
    const live = new Set(
        waves.flatMap(wave => wave.elements.map(element => element.id))
    );
    const unresolved: QuestionId[] = next.rows.flatMap(row =>
        row.matches
            .map(match => match.questionId)
            .filter(questionId => !live.has(questionId))
    );

    const checked = checkComparisonSave({
        waves,
        removed: await listRemovedQuestions(db, unresolved),
        stored: record.document,
        next
    });
    if (!checked.ok) return failed(checked.error);

    try {
        const version = await saveComparison(
            db,
            record.id,
            expectedVersion,
            checked.document
        );
        return ok({ version });
    } catch (error) {
        if (error instanceof DbConflictError) return failed("conflict");
        if (error instanceof DbNotFoundError) return failed("notFound");
        throw error;
    }
}
