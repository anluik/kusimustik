import { z } from "zod";

import { QuestionIdSchema } from "@/domain/ids";

/**
 * The element union. Everything downstream — the runner, the aggregator, the
 * CSV exporter, the builder's editor panel — switches over `type` and ends in
 * `assertNever`, so adding a variant here is deliberately a breaking change
 * that the compiler reports at every site that has to handle it.
 *
 * Validation messages in this file are developer-facing. Respondent-facing
 * wording is mapped from the issue code and path in the runner; see
 * docs/DECISIONS.md 007.
 */

export const ELEMENT_TYPES = [
    "statement",
    "single_choice",
    "multi_choice",
    "dropdown",
    "short_text",
    "long_text",
    "opinion_scale",
    "nps",
    "matrix_single"
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

/** Every type except the non-answerable `statement` block. */
export type AnswerableQuestionType = Exclude<ElementType, "statement">;

export const ANSWERABLE_QUESTION_TYPES: readonly AnswerableQuestionType[] =
    ELEMENT_TYPES.filter(
        (type): type is AnswerableQuestionType => type !== "statement"
    );

/** Scale bounds. `opinion_scale` always starts at 1; NPS is fixed at 0..10. */
export const OPINION_SCALE_MIN = 1;
export const OPINION_SCALE_MAX_STEPS = 15;
export const NPS_MIN = 0;
export const NPS_MAX = 10;

/**
 * Reserved option value standing for "the respondent chose Other and typed
 * something". Kept out of the author's option values by `optionList` so a real
 * option can never shadow it.
 */
export const OTHER_OPTION_VALUE = "__other__";

export const QUESTION_KEY_MAX_LENGTH = 64;

/**
 * Stable, human-readable identity for a question. Unique within a survey and
 * preserved across duplication — wave comparison and CSV column identity join
 * on this, never on `id`. See docs/DECISIONS.md 003.
 */
export const QuestionKeySchema = z
    .string()
    .max(QUESTION_KEY_MAX_LENGTH)
    .regex(/^[a-z][a-z0-9_]*$/, {
        error: "must start with a letter and contain only lowercase letters, digits and underscores"
    });

export const ChoiceOptionSchema = z.object({
    /** Stable across edits and waves; what an answer stores. */
    value: z.string().min(1).max(200),
    /** Display text; may be reworded freely without breaking anything. */
    label: z.string().min(1).max(500)
});
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

const optionList = (minimum: number) =>
    z
        .array(ChoiceOptionSchema)
        .min(minimum)
        .max(200)
        .check(ctx => {
            const values = ctx.value.map(option => option.value);
            if (new Set(values).size !== values.length) {
                ctx.issues.push({
                    code: "custom",
                    input: ctx.value,
                    message: "values must be unique"
                });
            }
            if (values.includes(OTHER_OPTION_VALUE)) {
                ctx.issues.push({
                    code: "custom",
                    input: ctx.value,
                    message: `"${OTHER_OPTION_VALUE}" is reserved for the free-text option`
                });
            }
        });

const elementBase = {
    id: QuestionIdSchema,
    key: QuestionKeySchema,
    title: z.string().min(1).max(500),
    description: z.string().max(2000).optional()
};

/**
 * `isAnswerable` is a literal, not a boolean, and is defaulted from the type —
 * so stored JSON need not carry it, a document that contradicts its own type
 * fails to parse, and TypeScript can narrow the union on it.
 */
const questionBase = {
    ...elementBase,
    isAnswerable: z.literal(true).default(true),
    required: z.boolean()
};

const otherFields = {
    allowOther: z.boolean().default(false),
    /**
     * Required whenever `allowOther` is set: it is the respondent-facing label
     * and the CSV header, so it has to come from the author (or the builder's
     * message catalogue), never from a literal in this package.
     */
    otherLabel: z.string().min(1).max(200).optional()
};

export const StatementElementSchema = z.object({
    ...elementBase,
    type: z.literal("statement"),
    isAnswerable: z.literal(false).default(false)
});

export const SingleChoiceQuestionSchema = z
    .object({
        ...questionBase,
        ...otherFields,
        type: z.literal("single_choice"),
        options: optionList(2)
    })
    .check(ctx => {
        if (ctx.value.allowOther && ctx.value.otherLabel === undefined) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["otherLabel"],
                message: "required when allowOther is set"
            });
        }
    });

export const MultiChoiceQuestionSchema = z
    .object({
        ...questionBase,
        ...otherFields,
        type: z.literal("multi_choice"),
        options: optionList(2),
        minSelections: z.int().min(1).optional(),
        maxSelections: z.int().min(1).optional()
    })
    .check(ctx => {
        const {
            minSelections: min,
            maxSelections: max,
            options,
            allowOther,
            otherLabel
        } = ctx.value;
        if (allowOther && otherLabel === undefined) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["otherLabel"],
                message: "required when allowOther is set"
            });
        }
        if (min !== undefined && max !== undefined && min > max) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                path: ["minSelections"],
                message: "cannot exceed maxSelections"
            });
        }
        const selectable = options.length + (allowOther ? 1 : 0);
        for (const [field, bound] of [
            ["minSelections", min],
            ["maxSelections", max]
        ] as const) {
            if (bound !== undefined && bound > selectable) {
                ctx.issues.push({
                    code: "custom",
                    input: ctx.value,
                    path: [field],
                    message: `cannot exceed the ${selectable} available selections`
                });
            }
        }
    });

export const DropdownQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("dropdown"),
    options: optionList(2)
});

export const ShortTextQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("short_text"),
    maxLength: z.int().min(1).max(1_000).optional(),
    placeholder: z.string().max(200).optional()
});

export const LongTextQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("long_text"),
    maxLength: z.int().min(1).max(10_000).optional(),
    placeholder: z.string().max(200).optional()
});

export const OpinionScaleQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("opinion_scale"),
    /** The scale runs 1..max. */
    max: z.int().min(2).max(OPINION_SCALE_MAX_STEPS),
    minLabel: z.string().min(1).max(200).optional(),
    maxLabel: z.string().min(1).max(200).optional()
});

export const NpsQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("nps")
});

export const MatrixSingleQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("matrix_single"),
    rows: optionList(1),
    columns: optionList(2)
});

export const SurveyElementSchema = z.discriminatedUnion("type", [
    StatementElementSchema,
    SingleChoiceQuestionSchema,
    MultiChoiceQuestionSchema,
    DropdownQuestionSchema,
    ShortTextQuestionSchema,
    LongTextQuestionSchema,
    OpinionScaleQuestionSchema,
    NpsQuestionSchema,
    MatrixSingleQuestionSchema
]);

export type SurveyElement = z.infer<typeof SurveyElementSchema>;
export type StatementElement = Extract<SurveyElement, { isAnswerable: false }>;
export type AnswerableQuestion = Extract<SurveyElement, { isAnswerable: true }>;

export type SingleChoiceQuestion = Extract<
    AnswerableQuestion,
    { type: "single_choice" }
>;
export type MultiChoiceQuestion = Extract<
    AnswerableQuestion,
    { type: "multi_choice" }
>;
export type DropdownQuestion = Extract<
    AnswerableQuestion,
    { type: "dropdown" }
>;
export type ShortTextQuestion = Extract<
    AnswerableQuestion,
    { type: "short_text" }
>;
export type LongTextQuestion = Extract<
    AnswerableQuestion,
    { type: "long_text" }
>;
export type OpinionScaleQuestion = Extract<
    AnswerableQuestion,
    { type: "opinion_scale" }
>;
export type NpsQuestion = Extract<AnswerableQuestion, { type: "nps" }>;
export type MatrixSingleQuestion = Extract<
    AnswerableQuestion,
    { type: "matrix_single" }
>;

/** Narrows a statement block out of the union. */
export function isAnswerableElement(
    element: SurveyElement
): element is AnswerableQuestion {
    return element.isAnswerable;
}

/**
 * Derives a stable key from a question title, folding diacritics rather than
 * dropping them so Estonian titles keep their words ("Küsimus" -> "kusimus").
 * Pass the keys already used in the survey and a numeric suffix is added until
 * the result is free.
 */
export function deriveQuestionKey(
    title: string,
    taken: Iterable<string> = []
): string {
    const slug = title
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const base = trimKey(
        slug === "" ? "question" : /^[0-9]/.test(slug) ? `q_${slug}` : slug
    );

    const used = new Set(taken);
    if (!used.has(base)) return base;

    for (let n = 2; ; n += 1) {
        const suffix = `_${n}`;
        const candidate = `${trimKey(base, QUESTION_KEY_MAX_LENGTH - suffix.length)}${suffix}`;
        if (!used.has(candidate)) return candidate;
    }
}

function trimKey(value: string, limit = QUESTION_KEY_MAX_LENGTH): string {
    return value.slice(0, limit).replace(/_+$/, "");
}
