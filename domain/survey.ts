import { z } from "zod";

import { LOCALES } from "@/domain/content";
import { SurveyIdSchema, WaveGroupIdSchema } from "@/domain/ids";
import { AuthoredElementSchema, SurveyElementSchema } from "@/domain/question";

export const SURVEY_STATUSES = ["draft", "published", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export { LOCALES };
export type { SurveyLocale } from "@/domain/content";

/**
 * A survey's name. Trimmed before validation, so a title of nothing but spaces
 * is rejected rather than stored — the create and rename forms parse this same
 * schema before they submit.
 *
 * The survey's own title and description are columns rather than part of the
 * `elements` document, and are not translated: they name the survey in the
 * owner's list and in their browser tab. What a respondent reads is the
 * document. See docs/DECISIONS.md 030.
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
 * The invariants that hold *between* elements rather than within any one: no
 * two share a `key`, and no two share an `id`. Neither is a question about
 * words, so both shapes of the document are held to it identically.
 */
const collisions = (
    elements: readonly { readonly id: string; readonly key: string }[]
): readonly string[] => [
    ...duplicate(elements.map(element => element.key)).map(
        key => `duplicate question key "${key}"`
    ),
    ...duplicate(elements.map(element => element.id)).map(
        id => `duplicate question id "${id}"`
    )
];

const elementList = <
    Element extends z.core.$ZodType<{
        readonly id: string;
        readonly key: string;
    }>
>(
    element: Element
) =>
    z.array(element).check(ctx => {
        for (const message of collisions(ctx.value)) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                message
            });
        }
    });

/**
 * A survey's elements in one language.
 *
 * Split out of `SurveySchema` so the builder can run it. The autosave gate
 * used to parse each element on its own, which no per-element schema can
 * catch a collision with — so a document with two questions on one key was
 * held to be valid, sent, and rejected by the server, leaving the builder in
 * a save-failed state it could not retry out of. The gate now parses this.
 */
export const SurveyElementsSchema = elementList(SurveyElementSchema);

/** The same list as it is stored: every language the author has written. */
export const AuthoredElementsSchema = elementList(AuthoredElementSchema);

const surveyFields = {
    id: SurveyIdSchema,
    title: SurveyTitleSchema,
    description: SurveyDescriptionSchema.optional(),
    status: z.literal(SURVEY_STATUSES),
    /** Assigned on publish; null while the survey has never been published. */
    slug: SurveySlugSchema.nullable(),
    /**
     * The language the survey is authored in, and the fallback every piece of
     * its text resolves through when a translation is missing.
     */
    locale: z.literal(LOCALES),
    /** Shared by every wave of the same recurring survey. See DECISIONS 003. */
    waveGroupId: WaveGroupIdSchema,
    /** Free text ("2026", "Q1") used as the series label in comparisons. */
    waveLabel: WaveLabelSchema.optional()
};

const publishedNeedsSlug = <T extends { status: string; slug: string | null }>(
    ctx: z.core.ParsePayload<T>
): void => {
    if (ctx.value.status === "published" && ctx.value.slug === null) {
        ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: ["slug"],
            message: "a published survey needs a slug"
        });
    }
};

/** A survey in one language: what a runner renders and a report titles. */
export const SurveySchema = z
    .object({ ...surveyFields, elements: SurveyElementsSchema })
    .check(publishedNeedsSlug);

/** A survey as it is stored, translations and all. */
export const AuthoredSurveySchema = z
    .object({ ...surveyFields, elements: AuthoredElementsSchema })
    .check(publishedNeedsSlug);

export type Survey = z.infer<typeof SurveySchema>;
export type AuthoredSurvey = z.infer<typeof AuthoredSurveySchema>;
