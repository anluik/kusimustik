import { z } from "zod";

import type { SurveyId, WaveGroupId } from "@/domain/ids";
import { QuestionIdSchema, SurveyIdSchema } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import { ELEMENT_TYPES, SurveyElementSchema } from "@/domain/question";
import type { Survey } from "@/domain/survey";
import {
    LOCALES,
    SURVEY_STATUSES,
    SurveySchema,
    SurveySlugSchema,
    SurveyTitleSchema,
    WaveLabelSchema
} from "@/domain/survey";
import { proposeSlug } from "@/domain/slug";
import {
    DbConflictError,
    DbNotFoundError,
    DbUniqueViolationError,
    unwrap
} from "@/lib/db/errors";
import { TimestampSchema, parseRow, parseRows } from "@/lib/db/parse";
import type { Db } from "@/lib/db/types";

/**
 * Surveys. The definition itself is the JSONB `elements` column and is parsed
 * through `SurveySchema` on every read (docs/DECISIONS.md 001), so a document
 * the domain would reject never reaches the builder or the runner.
 */

const DEFINITION_COLUMNS =
    "id, title, description, status, slug, locale, wave_group_id, wave_label, elements";

const RECORD_COLUMNS = `${DEFINITION_COLUMNS}, owner_id, version, published_version, created_at, updated_at, published_at, closed_at`;

const SUMMARY_COLUMNS =
    "id, title, description, status, slug, locale, wave_group_id, wave_label, owner_id, version, published_version, created_at, updated_at, published_at, closed_at";

/** The survey plus the columns the domain deliberately knows nothing about. */
export const SurveyRecordSchema = z.object({
    survey: SurveySchema,
    ownerId: z.uuid(),
    /** Bumped on every definition change; the optimistic-concurrency token. */
    version: z.int().positive(),
    publishedVersion: z.int().positive().nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    publishedAt: TimestampSchema.nullable(),
    closedAt: TimestampSchema.nullable()
});
export type SurveyRecord = z.infer<typeof SurveyRecordSchema>;

/** Everything except the definition — what a list page needs. */
export const SurveySummarySchema = SurveyRecordSchema.omit({
    survey: true
}).extend({
    id: SurveyIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    status: z.literal(SURVEY_STATUSES),
    slug: SurveySlugSchema.nullable(),
    locale: z.literal(LOCALES),
    waveGroupId: z.uuid(),
    waveLabel: z.string().nullable()
});
export type SurveySummary = z.infer<typeof SurveySummarySchema>;

/** A row of the derived projection; see docs/DECISIONS.md 002. */
export const SurveyQuestionSchema = z.object({
    questionId: QuestionIdSchema,
    surveyId: SurveyIdSchema,
    key: z.string().min(1),
    type: z.literal(ELEMENT_TYPES),
    title: z.string().min(1),
    position: z.int().nonnegative(),
    /** Set once the question has left the document but answers still exist. */
    removedAt: TimestampSchema.nullable()
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const NewSurveySchema = z.object({
    ownerId: z.uuid(),
    title: SurveyTitleSchema,
    description: z.string().max(2000).optional(),
    locale: z.literal(LOCALES).default("et"),
    /** Omit for a new survey; pass the source's to add a wave to a group. */
    waveGroupId: z.uuid().optional(),
    waveLabel: WaveLabelSchema.optional(),
    elements: z.array(SurveyElementSchema).default([])
});
export type NewSurvey = z.input<typeof NewSurveySchema>;

/** The definition columns as they come back from PostgREST or the public RPC. */
type DefinitionColumns = {
    id: string;
    title: string;
    description: string | null;
    status: string;
    slug: string | null;
    locale: string;
    wave_group_id: string;
    wave_label: string | null;
    elements: unknown;
};

type RecordColumns = DefinitionColumns & {
    owner_id: string;
    version: number;
    published_version: number | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
    closed_at: string | null;
};

function surveyInput(row: DefinitionColumns) {
    return {
        id: row.id,
        title: row.title,
        // Spread rather than `?? undefined`: `exactOptionalPropertyTypes` means
        // an absent optional and one present-but-undefined are not the same.
        ...(row.description !== null && { description: row.description }),
        status: row.status,
        slug: row.slug,
        locale: row.locale,
        waveGroupId: row.wave_group_id,
        ...(row.wave_label !== null && { waveLabel: row.wave_label }),
        elements: row.elements
    };
}

function toSurvey(row: DefinitionColumns): Survey {
    return parseRow(SurveySchema, surveyInput(row), `survey ${row.id}`);
}

function toRecord(row: RecordColumns): SurveyRecord {
    return parseRow(
        SurveyRecordSchema,
        {
            survey: surveyInput(row),
            ownerId: row.owner_id,
            version: row.version,
            publishedVersion: row.published_version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            publishedAt: row.published_at,
            closedAt: row.closed_at
        },
        `survey ${row.id}`
    );
}

function toSummary(row: Omit<RecordColumns, "elements">): SurveySummary {
    return parseRow(
        SurveySummarySchema,
        {
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status,
            slug: row.slug,
            locale: row.locale,
            waveGroupId: row.wave_group_id,
            waveLabel: row.wave_label,
            ownerId: row.owner_id,
            version: row.version,
            publishedVersion: row.published_version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            publishedAt: row.published_at,
            closedAt: row.closed_at
        },
        `survey ${row.id}`
    );
}

/** Null when the survey does not exist *or* the caller may not see it. */
export async function getSurvey(
    db: Db,
    id: SurveyId
): Promise<SurveyRecord | null> {
    const row = unwrap(
        `getSurvey(${id})`,
        await db
            .from("surveys")
            .select(RECORD_COLUMNS)
            .eq("id", id)
            .maybeSingle()
    );
    return row === null ? null : toRecord(row);
}

/** The runner's read path: reachable by slug, never enumerable. */
export async function getPublishedSurveyBySlug(
    db: Db,
    slug: string
): Promise<Survey | null> {
    const row = unwrap(
        `getPublishedSurveyBySlug(${slug})`,
        await db.rpc("get_published_survey", { p_slug: slug }).maybeSingle()
    );
    return row === null ? null : toSurvey(row);
}

/** Newest first. RLS already scopes this to the caller's own surveys. */
export async function listSurveys(db: Db): Promise<SurveySummary[]> {
    const rows = unwrap(
        "listSurveys",
        await db
            .from("surveys")
            .select(SUMMARY_COLUMNS)
            .order("updated_at", { ascending: false })
    );
    return rows.map(toSummary);
}

/** Every wave of one recurring survey, oldest first; see DECISIONS 003. */
export async function listSurveysInWaveGroup(
    db: Db,
    waveGroupId: WaveGroupId
): Promise<SurveySummary[]> {
    const rows = unwrap(
        `listSurveysInWaveGroup(${waveGroupId})`,
        await db
            .from("surveys")
            .select(SUMMARY_COLUMNS)
            .eq("wave_group_id", waveGroupId)
            .order("created_at", { ascending: true })
    );
    return rows.map(toSummary);
}

export async function createSurvey(
    db: Db,
    input: NewSurvey
): Promise<SurveyRecord> {
    const parsed = NewSurveySchema.parse(input);
    const row = unwrap(
        "createSurvey",
        await db
            .from("surveys")
            .insert({
                owner_id: parsed.ownerId,
                title: parsed.title,
                description: parsed.description ?? null,
                locale: parsed.locale,
                ...(parsed.waveGroupId !== undefined && {
                    wave_group_id: parsed.waveGroupId
                }),
                wave_label: parsed.waveLabel ?? null,
                elements: parsed.elements
            })
            .select(RECORD_COLUMNS)
            .single()
    );
    return toRecord(row);
}

export type SurveyDefinitionPatch = {
    readonly title?: string;
    readonly description?: string | null;
    readonly locale?: Survey["locale"];
    readonly waveLabel?: string | null;
    readonly elements?: readonly SurveyElement[];
};

/**
 * The builder's save. `expectedVersion` is the version the caller last read:
 * a mismatch means someone else — or another tab — saved in between, and the
 * caller must refetch rather than overwrite. Zero rows updated is ambiguous
 * between "gone" and "moved on", so the reason is established with a follow-up
 * read on the failure path only.
 */
export async function updateSurveyDefinition(
    db: Db,
    id: SurveyId,
    expectedVersion: number,
    patch: SurveyDefinitionPatch
): Promise<SurveyRecord> {
    const row = unwrap(
        `updateSurveyDefinition(${id})`,
        await db
            .from("surveys")
            .update({
                ...(patch.title !== undefined && { title: patch.title }),
                ...(patch.description !== undefined && {
                    description: patch.description
                }),
                ...(patch.locale !== undefined && { locale: patch.locale }),
                ...(patch.waveLabel !== undefined && {
                    wave_label: patch.waveLabel
                }),
                ...(patch.elements !== undefined && {
                    elements: [...patch.elements]
                })
            })
            .eq("id", id)
            .eq("version", expectedVersion)
            .select(RECORD_COLUMNS)
            .maybeSingle()
    );

    if (row !== null) return toRecord(row);

    const current = await getSurvey(db, id);
    if (current === null) {
        throw new DbNotFoundError(
            `survey ${id} does not exist or is not yours`
        );
    }
    throw new DbConflictError(
        `survey ${id} has moved on: expected version ${expectedVersion}, found ${current.version}`
    );
}

/**
 * Publishing assigns the public slug and flips the status; the triggers do the
 * rest — the definition is snapshotted as a new `survey_versions` row that
 * every response submitted from now on points at.
 *
 * Takes the slug rather than deriving it: reopening a closed survey has to
 * re-use the link that is already in people's inboxes. `publishSurveyAs` is
 * the entry point that decides which.
 */
export async function publishSurvey(
    db: Db,
    id: SurveyId,
    slug: string
): Promise<SurveyRecord> {
    const row = unwrap(
        `publishSurvey(${id})`,
        await db
            .from("surveys")
            .update({ status: "published", slug: SurveySlugSchema.parse(slug) })
            .eq("id", id)
            .select(RECORD_COLUMNS)
            .maybeSingle()
    );
    if (row === null) {
        throw new DbNotFoundError(
            `survey ${id} does not exist or is not yours`
        );
    }
    return toRecord(row);
}

/** How many slugs to try before giving up; see `publishSurveyDerivingSlug`. */
const SLUG_ATTEMPTS = 6;

/**
 * Publish, keeping the slug the survey already has or deriving a fresh one
 * from its title.
 *
 * Uniqueness is the database's `slug unique` index, not a read-then-write
 * check: two owners publishing similarly titled surveys in the same instant
 * would both pass a pre-flight `select` and one would still fail. So the loop
 * offers a candidate and lets the index arbitrate, with a new suffix each time.
 * `proposeSlug` only repeats itself on a 31^6 collision, so the second attempt
 * effectively always lands.
 */
export async function publishSurveyDerivingSlug(
    db: Db,
    record: SurveyRecord
): Promise<SurveyRecord> {
    const { id, slug, title } = record.survey;

    // Already has one: it is in circulation and is not up for renegotiation.
    if (slug !== null) return publishSurvey(db, id, slug);

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            return await publishSurvey(db, id, proposeSlug(title, attempt));
        } catch (error) {
            if (!(error instanceof DbUniqueViolationError)) throw error;
        }
    }
    throw new DbConflictError(
        `could not find a free slug for survey ${id} in ${SLUG_ATTEMPTS} attempts`
    );
}

/** Closed surveys keep their slug and stop accepting responses. */
export async function closeSurvey(db: Db, id: SurveyId): Promise<SurveyRecord> {
    const row = unwrap(
        `closeSurvey(${id})`,
        await db
            .from("surveys")
            .update({ status: "closed" })
            .eq("id", id)
            .select(RECORD_COLUMNS)
            .maybeSingle()
    );
    if (row === null) {
        throw new DbNotFoundError(
            `survey ${id} does not exist or is not yours`
        );
    }
    return toRecord(row);
}

/** Cascades to versions, questions, responses, answers and events. */
export async function deleteSurvey(db: Db, id: SurveyId): Promise<void> {
    unwrap(
        `deleteSurvey(${id})`,
        await db.from("surveys").delete().eq("id", id)
    );
}

/**
 * The derived projection, in document order. Tombstoned questions — removed
 * from the definition but still carrying answers — are excluded unless asked
 * for; see docs/DECISIONS.md 008.
 */
export async function listSurveyQuestions(
    db: Db,
    surveyId: SurveyId,
    options: { readonly includeRemoved?: boolean } = {}
): Promise<SurveyQuestion[]> {
    let query = db
        .from("survey_questions")
        .select(
            "question_id, survey_id, key, type, title, position, removed_at"
        )
        .eq("survey_id", surveyId);

    if (options.includeRemoved !== true) query = query.is("removed_at", null);

    const rows = unwrap(
        `listSurveyQuestions(${surveyId})`,
        await query.order("position", { ascending: true })
    );

    return parseRows(
        SurveyQuestionSchema,
        rows.map(row => ({
            questionId: row.question_id,
            surveyId: row.survey_id,
            key: row.key,
            type: row.type,
            title: row.title,
            position: row.position,
            removedAt: row.removed_at
        })),
        `survey_questions of ${surveyId}`
    );
}

/** Per-survey counts for the list; see the `survey_stats` migration. */
export const SurveyStatsSchema = z.object({
    surveyId: SurveyIdSchema,
    responseCount: z.int().nonnegative(),
    /** Answerable elements still in the document — statements and tombstoned
     *  questions are excluded by the view (docs/DECISIONS.md 008). */
    questionCount: z.int().nonnegative()
});
export type SurveyStats = z.infer<typeof SurveyStatsSchema>;

/**
 * Counts for every survey the caller owns, keyed by survey id.
 *
 * One query for the whole list rather than one per row, and a map rather than
 * an array because the caller has already got the summaries and only needs to
 * look counts up. The view is `security_invoker`, so RLS still decides what is
 * in it.
 */
export async function listSurveyStats(
    db: Db
): Promise<ReadonlyMap<SurveyId, SurveyStats>> {
    const rows = unwrap(
        "listSurveyStats",
        await db
            .from("survey_stats")
            .select("survey_id, response_count, question_count")
    );

    // The view's columns are all nullable in the generated types — Postgres
    // cannot prove otherwise for a view — but `count(*)` over a primary key
    // never is, so a null here is a broken migration and should say so.
    const stats = parseRows(
        SurveyStatsSchema,
        rows.map(row => ({
            surveyId: row.survey_id,
            responseCount: row.response_count,
            questionCount: row.question_count
        })),
        "survey_stats"
    );

    return new Map(stats.map(entry => [entry.surveyId, entry]));
}
