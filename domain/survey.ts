import { z } from "zod";

import { SurveyIdSchema, WaveGroupIdSchema } from "@/domain/ids";
import { SurveyElementSchema } from "@/domain/question";

export const SURVEY_STATUSES = ["draft", "published", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const LOCALES = ["et", "en", "ru"] as const;
export type SurveyLocale = (typeof LOCALES)[number];

/**
 * A survey's name. Trimmed before validation, so a title of nothing but spaces
 * is rejected rather than stored — the create and rename forms parse this same
 * schema before they submit.
 */
export const SurveyTitleSchema = z.string().trim().min(1).max(300);

/**
 * The paragraph a respondent reads above the first question. Optional, and
 * trimmed like the title, so a description of nothing but spaces is no
 * description rather than an empty line in the runner.
 */
export const SurveyDescriptionSchema = z.string().trim().max(2000);

/** Free text ("2026", "Q1") naming one wave of a recurring survey. */
export const WaveLabelSchema = z.string().trim().min(1).max(100);

/** The public runner lives at `/k/[slug]`, so slugs have to be url-safe. */
export const SurveySlugSchema = z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        error: "must be lowercase words separated by single hyphens"
    });

const duplicate = <T>(items: readonly T[]): readonly T[] => {
    const seen = new Set<T>();
    return items.filter(item =>
        seen.has(item) ? true : (seen.add(item), false)
    );
};

/**
 * A survey's elements, including the two invariants that hold *between* them
 * rather than within any one: no two elements share a `key`, and no two share
 * an `id`.
 *
 * Split out of `SurveySchema` so the builder can run it. The autosave gate
 * used to parse each element on its own, which no per-element schema can
 * catch a collision with — so a document with two questions on one key was
 * held to be valid, sent, and rejected by the server, leaving the builder in
 * a save-failed state it could not retry out of. The gate now parses this.
 */
export const SurveyElementsSchema = z.array(SurveyElementSchema).check(ctx => {
    const elements = ctx.value;

    for (const key of duplicate(elements.map(element => element.key))) {
        ctx.issues.push({
            code: "custom",
            input: elements,
            message: `duplicate question key "${key}"`
        });
    }
    for (const id of duplicate(elements.map(element => element.id))) {
        ctx.issues.push({
            code: "custom",
            input: elements,
            message: `duplicate question id "${id}"`
        });
    }
});

export const SurveySchema = z
    .object({
        id: SurveyIdSchema,
        title: SurveyTitleSchema,
        description: SurveyDescriptionSchema.optional(),
        status: z.literal(SURVEY_STATUSES),
        /** Assigned on publish; null while the survey has never been published. */
        slug: SurveySlugSchema.nullable(),
        locale: z.literal(LOCALES),
        /** Shared by every wave of the same recurring survey. See DECISIONS 003. */
        waveGroupId: WaveGroupIdSchema,
        /** Free text ("2026", "Q1") used as the series label in comparisons. */
        waveLabel: WaveLabelSchema.optional(),
        elements: SurveyElementsSchema
    })
    .check(ctx => {
        const { status, slug } = ctx.value;

        if (status === "published" && slug === null) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["slug"],
                message: "a published survey needs a slug"
            });
        }
    });

export type Survey = z.infer<typeof SurveySchema>;
