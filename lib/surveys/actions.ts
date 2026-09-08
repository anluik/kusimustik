"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { duplicateSurvey } from "@/domain/duplicate";
import { SurveyIdSchema } from "@/domain/ids";
import type { SurveyId } from "@/domain/ids";
import { SurveyElementSchema } from "@/domain/question";
import {
    LOCALES,
    SurveyDescriptionSchema,
    SurveySchema,
    SurveyTitleSchema,
    WaveLabelSchema
} from "@/domain/survey";
import { failed, ok, runAction } from "@/lib/actions/result";
import { requireSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";
import { DbConflictError } from "@/lib/db/errors";
import {
    closeSurvey,
    createSurvey,
    deleteSurvey,
    getSurvey,
    publishSurveyDerivingSlug,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";
import type { Db } from "@/lib/db/types";
import type {
    SurveyActionError,
    SurveyActionResult
} from "@/lib/surveys/errors";
import { createServerDb } from "@/lib/supabase/server";

/**
 * Survey CRUD.
 *
 * Every action here is a public POST endpoint reachable without going through
 * the UI, so each one re-checks the session itself and re-parses its input —
 * the page having checked is not an argument. Ownership is not re-checked in
 * application code on purpose: the request-scoped client carries the owner's
 * identity, so RLS answers that question, and a survey belonging to someone
 * else simply does not exist as far as these reads are concerned.
 */

const IdInputSchema = z.object({ surveyId: SurveyIdSchema });

const CreateInputSchema = z.object({
    title: SurveyTitleSchema,
    locale: z.literal(LOCALES)
});
export type CreateSurveyInput = z.input<typeof CreateInputSchema>;

const RenameInputSchema = IdInputSchema.extend({ title: SurveyTitleSchema });
export type RenameSurveyInput = z.input<typeof RenameInputSchema>;

const DuplicateInputSchema = IdInputSchema.extend({
    /** Empty means "no label"; the copy then simply has none. */
    waveLabel: WaveLabelSchema.nullable()
});
export type DuplicateSurveyInput = z.input<typeof DuplicateInputSchema>;

/**
 * Session, database client and the survey in one step, since every action but
 * create needs all three. Returns the error code rather than throwing so the
 * caller stays inside the envelope.
 */
async function withSurvey(surveyId: SurveyId): Promise<
    | {
          readonly ok: true;
          readonly user: SessionUser;
          readonly db: Db;
          readonly record: SurveyRecord;
      }
    | { readonly ok: false; readonly error: SurveyActionError }
> {
    const user = await requireSessionUser();
    const db = await createServerDb();
    const record = await getSurvey(db, surveyId);
    // Null covers both "deleted" and "someone else's". Telling those apart
    // would be an ownership oracle, and the owner cannot act on the difference.
    if (record === null) return { ok: false, error: "notFound" };
    return { ok: true, user, db, record };
}

export async function createSurveyAction(
    input: CreateSurveyInput
): Promise<SurveyActionResult<{ surveyId: SurveyId }>> {
    return runAction("failed", async () => {
        const user = await requireSessionUser();
        const parsed = CreateInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const db = await createServerDb();
        const created = await createSurvey(db, {
            ownerId: user.id,
            title: parsed.data.title,
            locale: parsed.data.locale
        });

        refresh();
        return ok({ surveyId: created.survey.id });
    });
}

export async function renameSurveyAction(
    input: RenameSurveyInput
): Promise<SurveyActionResult> {
    return runAction("failed", async () => {
        const parsed = RenameInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        try {
            await updateSurveyDefinition(
                found.db,
                parsed.data.surveyId,
                found.record.version,
                { title: parsed.data.title }
            );
        } catch (error) {
            // Another tab saved between the read above and this write. The
            // owner refetches and tries again rather than clobbering it.
            if (error instanceof DbConflictError) return failed("conflict");
            throw error;
        }

        refresh();
        return ok(undefined);
    });
}

const SaveElementsInputSchema = IdInputSchema.extend({
    /** The version the builder last read; see `updateSurveyDefinition`. */
    expectedVersion: z.int().positive(),
    elements: z.array(SurveyElementSchema)
});
export type SaveSurveyElementsInput = z.input<typeof SaveElementsInputSchema>;

/**
 * The builder's autosave.
 *
 * The document is re-parsed twice on purpose: once as an array of elements,
 * and once as the whole survey it would become, because the rules that matter
 * most here — no two questions sharing a `key`, none sharing an `id` — are
 * survey-level and live on `SurveySchema`. A client that skipped the builder
 * entirely gets the same answer as one that used it.
 *
 * `expectedVersion` is what keeps two open tabs from silently overwriting each
 * other, and the new version comes back so the builder can carry on saving
 * without a refetch. Nothing is revalidated: this fires while the owner is
 * typing, and refreshing the router under an open editor on every keystroke's
 * worth of debounce would be all cost.
 */
export async function saveSurveyElementsAction(
    input: SaveSurveyElementsInput
): Promise<SurveyActionResult<{ version: number }>> {
    return runAction("failed", async () => {
        const parsed = SaveElementsInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        const candidate = SurveySchema.safeParse({
            ...found.record.survey,
            elements: parsed.data.elements
        });
        if (!candidate.success) return failed("invalidInput");

        try {
            const saved = await updateSurveyDefinition(
                found.db,
                parsed.data.surveyId,
                parsed.data.expectedVersion,
                { elements: candidate.data.elements }
            );
            return ok({ version: saved.version });
        } catch (error) {
            if (error instanceof DbConflictError) return failed("conflict");
            throw error;
        }
    });
}

const SettingsInputSchema = IdInputSchema.extend({
    /** The version the builder last read; see `updateSurveyDefinition`. */
    expectedVersion: z.int().positive(),
    title: SurveyTitleSchema,
    /** Empty means "no description"; the runner then shows none. */
    description: SurveyDescriptionSchema.nullable(),
    locale: z.literal(LOCALES),
    /** Empty means "no label"; the survey then simply has none. */
    waveLabel: WaveLabelSchema.nullable()
});
export type SaveSurveySettingsInput = z.input<typeof SettingsInputSchema>;

/**
 * The survey-level settings the builder owns: its title, the language the
 * runner renders it in, and which wave of its group it is.
 *
 * It carries `expectedVersion` and returns the new one for the same reason
 * the autosave does — the title and the locale are part of the definition, so
 * saving them bumps the version out from under the builder, which would then
 * lose its next autosave to a conflict it did not cause.
 *
 * `waveLabel` is deliberately not part of the definition: it names a wave for
 * comparison rather than changing what a respondent is asked, so editing it
 * alone leaves the version — and therefore the published snapshot — alone.
 *
 * The description *is* part of it: the runner renders it above the first
 * question, so changing it changes what a respondent reads.
 */
export async function saveSurveySettingsAction(
    input: SaveSurveySettingsInput
): Promise<SurveyActionResult<{ version: number }>> {
    return runAction("failed", async () => {
        const parsed = SettingsInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        // An emptied description is *no* description rather than an empty
        // string, the same rule `element-patch.ts` follows one level down: the
        // survey is JSONB read back through `SurveySchema`, where absent and
        // present-but-empty are different things. Null on the wire, absent in
        // the document, and `null` in the patch so the column is cleared.
        const candidate = SurveySchema.safeParse({
            ...found.record.survey,
            title: parsed.data.title,
            description: parsed.data.description ?? undefined,
            locale: parsed.data.locale,
            ...(parsed.data.waveLabel !== null && {
                waveLabel: parsed.data.waveLabel
            })
        });
        if (!candidate.success) return failed("invalidInput");

        try {
            const saved = await updateSurveyDefinition(
                found.db,
                parsed.data.surveyId,
                parsed.data.expectedVersion,
                {
                    title: candidate.data.title,
                    description: parsed.data.description,
                    locale: candidate.data.locale,
                    waveLabel: parsed.data.waveLabel
                }
            );

            // Unlike the autosave, this is a deliberate submit and not a
            // keystroke: the app bar title, the survey list and the runner's
            // language all follow from it.
            refresh();
            return ok({ version: saved.version });
        } catch (error) {
            if (error instanceof DbConflictError) return failed("conflict");
            throw error;
        }
    });
}

/**
 * Duplicating is how a recurring survey gets its next wave: the copy keeps the
 * source's `waveGroupId` and every question `key`, and gets fresh ids, so a
 * year from now the two are still comparable (docs/DECISIONS.md 003). It comes
 * back as an unpublished draft with no slug, so it cannot take over the
 * source's public link.
 */
export async function duplicateSurveyAction(
    input: DuplicateSurveyInput
): Promise<SurveyActionResult<{ surveyId: SurveyId }>> {
    return runAction("failed", async () => {
        const parsed = DuplicateInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        const copy = duplicateSurvey(found.record.survey, {
            waveLabel: parsed.data.waveLabel
        });

        const created = await createSurvey(found.db, {
            ownerId: found.user.id,
            title: copy.title,
            ...(copy.description !== undefined && {
                description: copy.description
            }),
            locale: copy.locale,
            waveGroupId: copy.waveGroupId,
            ...(copy.waveLabel !== undefined && { waveLabel: copy.waveLabel }),
            elements: copy.elements
        });

        refresh();
        return ok({ surveyId: created.survey.id });
    });
}

/**
 * Publishing assigns the public link on the first publish and re-uses it on
 * every later one — reopening a closed survey must not invalidate a link that
 * is already in two thousand inboxes.
 */
export async function publishSurveyAction(input: {
    readonly surveyId: string;
}): Promise<SurveyActionResult<{ slug: string }>> {
    return runAction("failed", async () => {
        const parsed = IdInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        // A survey with nothing to answer is a link to an empty page. The
        // button is disabled for this too; this is the check that counts.
        const answerable = found.record.survey.elements.filter(
            element => element.isAnswerable
        );
        if (answerable.length === 0) return failed("noQuestions");

        const published = await publishSurveyDerivingSlug(
            found.db,
            found.record
        );
        const { slug } = published.survey;
        if (slug === null) return failed("failed");

        refresh();
        return ok({ slug });
    });
}

/** Closed surveys keep their slug and their responses; they stop collecting. */
export async function closeSurveyAction(input: {
    readonly surveyId: string;
}): Promise<SurveyActionResult> {
    return runAction("failed", async () => {
        const parsed = IdInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        await closeSurvey(found.db, parsed.data.surveyId);

        refresh();
        return ok(undefined);
    });
}

/** Cascades to versions, questions, responses, answers and events. */
export async function deleteSurveyAction(input: {
    readonly surveyId: string;
}): Promise<SurveyActionResult> {
    return runAction("failed", async () => {
        const parsed = IdInputSchema.safeParse(input);
        if (!parsed.success) return failed("invalidInput");

        const found = await withSurvey(parsed.data.surveyId);
        if (!found.ok) return failed(found.error);

        await deleteSurvey(found.db, parsed.data.surveyId);

        refresh();
        return ok(undefined);
    });
}
