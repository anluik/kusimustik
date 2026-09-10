import { z } from "zod";

import { LOCALES, localizedTextSchema, orderLocales } from "@/domain/content";
import type { SurveyLocale } from "@/domain/content";
import { SurveyIdSchema, WaveGroupIdSchema } from "@/domain/ids";
import { AuthoredElementSchema, SurveyElementSchema } from "@/domain/question";

export const SURVEY_STATUSES = ["draft", "published", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export { LOCALES };
export type { SurveyLocale } from "@/domain/content";

/**
 * How long the survey's own words may be, per language. One source for both
 * shapes, exactly as `TEXT_MAX` is in `domain/question.ts`.
 */
const SURVEY_TEXT_MAX = { title: 300, description: 2000 } as const;

/**
 * A survey's name, in one language.
 *
 * The resolved shape keeps the plain name, the rule DECISIONS 030 set for
 * elements: nine-tenths of the codebase works in one language, and this is the
 * schema the create dialog's single field and the header block's title still
 * parse. `AuthoredSurveyTitleSchema` below is what the column holds.
 *
 * Trimmed before validation, so a title of nothing but spaces is rejected
 * rather than stored.
 */
export const SurveyTitleSchema = z
    .string()
    .trim()
    .min(1)
    .max(SURVEY_TEXT_MAX.title);

/**
 * The paragraph a respondent reads above the first question. Optional, and
 * trimmed like the title, so a description of nothing but spaces is no
 * description rather than an empty line in the runner.
 */
export const SurveyDescriptionSchema = z
    .string()
    .trim()
    .max(SURVEY_TEXT_MAX.description);

/**
 * The same two as they are *stored*: locale-keyed, like every other word a
 * respondent reads (docs/DECISIONS.md 034).
 *
 * These do not trim, and neither does any element's text. `withLocale` treats
 * whitespace-only as *absence*, which is stronger — it withdraws the language
 * rather than storing a blank — so a title of nothing but spaces still cannot
 * be stored: what is left is the empty map, which the schema refuses. What is
 * no longer trimmed is the padding around a real title.
 */
export const AuthoredSurveyTitleSchema = localizedTextSchema(
    SURVEY_TEXT_MAX.title
);
export const AuthoredSurveyDescriptionSchema = localizedTextSchema(
    SURVEY_TEXT_MAX.description
);

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

/**
 * A survey's languages, canonically ordered and without duplicates.
 *
 * The order is `LOCALES`', not the author's, so two surveys offered in the
 * same languages compare equal and every switcher lists them the same way
 * round. `orderLocales` is what callers normalise with; the database's
 * `surveys_before_write()` does the same thing on the way in, so a document
 * assembled outside the builder cannot store a set this rejects.
 */
export const SurveyLocalesSchema = z
    .array(z.literal(LOCALES))
    .min(1)
    .check(ctx => {
        const canonical = orderLocales(ctx.value);
        if (
            canonical.length !== ctx.value.length ||
            canonical.some((locale, index) => locale !== ctx.value[index])
        ) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                message: "must be unique and in LOCALES order"
            });
        }
    });

/**
 * The survey's own words — its title and the paragraph above the first
 * question — in the two shapes every other piece of content has.
 *
 * They are their own pair rather than fields spliced into the survey schemas,
 * because the builder holds them on their own: the header block is the first
 * thing in the element list, the editor panel binds to one language of it, and
 * the reducer merges an edit back into it. See docs/DECISIONS.md 034.
 */
const resolvedHeadFields = {
    title: SurveyTitleSchema,
    description: SurveyDescriptionSchema.optional()
};

const authoredHeadFields = {
    title: AuthoredSurveyTitleSchema,
    description: AuthoredSurveyDescriptionSchema.optional()
};

/** The survey's words in one language: what the runner and the panel read. */
export const SurveyHeadSchema = z.object(resolvedHeadFields);
/** The same as the columns hold them, every translation included. */
export const AuthoredSurveyHeadSchema = z.object(authoredHeadFields);

export type SurveyHead = z.infer<typeof SurveyHeadSchema>;
export type AuthoredSurveyHead = z.infer<typeof AuthoredSurveyHeadSchema>;

/** Everything about a survey that is not a word. */
const surveyFields = {
    id: SurveyIdSchema,
    status: z.literal(SURVEY_STATUSES),
    /** Assigned on publish; null while the survey has never been published. */
    slug: SurveySlugSchema.nullable(),
    /**
     * The language the survey is authored in, and the fallback every piece of
     * its text resolves through when a translation is missing.
     */
    locale: z.literal(LOCALES),
    /**
     * Every language the survey is *offered* in — what the builder lets an
     * author switch between and what the runner will let a respondent pick.
     *
     * Always contains `locale`, and never empty: a survey nobody can be shown
     * is not a state. It is separate from what has actually been written,
     * because it has to be chosen *before* a word of the translation exists —
     * and because a language the author has half finished is still a language
     * the survey is offered in, falling back per field. See DECISIONS 031.
     */
    locales: SurveyLocalesSchema,
    /** Shared by every wave of the same recurring survey. See DECISIONS 003. */
    waveGroupId: WaveGroupIdSchema,
    /** Free text ("2026", "Q1") used as the series label in comparisons. */
    waveLabel: WaveLabelSchema.optional()
};

const localeIsOffered = <
    T extends { locale: SurveyLocale; locales: readonly SurveyLocale[] }
>(
    ctx: z.core.ParsePayload<T>
): void => {
    if (!ctx.value.locales.includes(ctx.value.locale)) {
        ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: ["locales"],
            message: "must include the language the survey is authored in"
        });
    }
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
    .object({
        ...surveyFields,
        ...resolvedHeadFields,
        elements: SurveyElementsSchema
    })
    .check(publishedNeedsSlug)
    .check(localeIsOffered);

/** A survey as it is stored, translations and all. */
export const AuthoredSurveySchema = z
    .object({
        ...surveyFields,
        ...authoredHeadFields,
        elements: AuthoredElementsSchema
    })
    .check(publishedNeedsSlug)
    .check(localeIsOffered);

export type Survey = z.infer<typeof SurveySchema>;
export type AuthoredSurvey = z.infer<typeof AuthoredSurveySchema>;
