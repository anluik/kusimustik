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

export const SurveySchema = z
    .object({
        id: SurveyIdSchema,
        title: SurveyTitleSchema,
        description: z.string().max(2000).optional(),
        status: z.literal(SURVEY_STATUSES),
        /** Assigned on publish; null while the survey has never been published. */
        slug: SurveySlugSchema.nullable(),
        locale: z.literal(LOCALES),
        /** Shared by every wave of the same recurring survey. See DECISIONS 003. */
        waveGroupId: WaveGroupIdSchema,
        /** Free text ("2026", "Q1") used as the series label in comparisons. */
        waveLabel: WaveLabelSchema.optional(),
        elements: z.array(SurveyElementSchema)
    })
    .check(ctx => {
        const { status, slug, elements } = ctx.value;

        if (status === "published" && slug === null) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["slug"],
                message: "a published survey needs a slug"
            });
        }

        const duplicate = <T>(items: readonly T[]) => {
            const seen = new Set<T>();
            return items.filter(item =>
                seen.has(item) ? true : (seen.add(item), false)
            );
        };

        for (const key of duplicate(elements.map(element => element.key))) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["elements"],
                message: `duplicate question key "${key}"`
            });
        }
        for (const id of duplicate(elements.map(element => element.id))) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["elements"],
                message: `duplicate question id "${id}"`
            });
        }
    });

export type Survey = z.infer<typeof SurveySchema>;
