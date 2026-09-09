import { z } from "zod";

import { localizedTextSchema } from "@/domain/content";
import { QuestionIdSchema } from "@/domain/ids";

/**
 * The element union. Everything downstream — the runner, the aggregator, the
 * CSV exporter, the builder's editor panel — switches over `type` and ends in
 * `assertNever`, so adding a variant here is deliberately a breaking change
 * that the compiler reports at every site that has to handle it.
 *
 * Every element exists in two shapes, and they differ only in their words:
 *
 * - **Authored** (`AuthoredElementSchema`) is what `surveys.elements` holds.
 *   Each piece of respondent-facing text is a `LocalizedText` map, so one
 *   element carries the question in every language it has been written in.
 * - **Resolved** (`SurveyElementSchema`) is that same element in one language.
 *   It is what a runner renders, an aggregator titles a chart with and an
 *   exporter writes a column header from — none of which have any business
 *   knowing that other translations exist.
 *
 * `domain/localize.ts` maps between them and is the only thing that may. The
 * two are built from one set of field definitions here, so a field added to
 * one is a compile error in the other; `question.test.ts` also fails if a new
 * piece of text is added to the resolved shape without a translated
 * counterpart. See docs/DECISIONS.md 030.
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
 * How long each piece of text may be. The limits apply per language, not to
 * the map: a translation is a different sentence, not a longer one.
 */
const TEXT_MAX = {
    title: 500,
    description: 2000,
    optionLabel: 500,
    otherLabel: 200,
    endpointLabel: 200,
    placeholder: 200
} as const;

/**
 * Stable, human-readable identity for a question. Unique within a survey and
 * preserved across duplication — wave comparison and CSV column identity join
 * on this, never on `id`. See docs/DECISIONS.md 003.
 *
 * Machine-facing, and therefore the same in every language.
 */
export const QuestionKeySchema = z
    .string()
    .max(QUESTION_KEY_MAX_LENGTH)
    .regex(/^[a-z][a-z0-9_]*$/, {
        error: "must start with a letter and contain only lowercase letters, digits and underscores"
    });

/** One choice's stored value: what an answer holds, in every language. */
const OptionValueSchema = z.string().min(1).max(200);

const text = (max: number) => z.string().min(1).max(max);

const choiceOption = <Label extends z.core.SomeType>(label: Label) =>
    z.object({ value: OptionValueSchema, label });

export const ChoiceOptionSchema = choiceOption(text(TEXT_MAX.optionLabel));
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

export const AuthoredChoiceOptionSchema = choiceOption(
    localizedTextSchema(TEXT_MAX.optionLabel)
);
export type AuthoredChoiceOption = z.infer<typeof AuthoredChoiceOptionSchema>;

// --- Shared refinements -----------------------------------------------------
//
// The rules that hold between an element's fields hold in both shapes, and
// none of them reads a word of the text — only whether it is there. They are
// written once against the fields they actually touch and applied to both.

type FieldIssue = {
    readonly path?: readonly PropertyKey[];
    readonly message: string;
};

function report<T>(
    ctx: z.core.ParsePayload<T>,
    issues: readonly FieldIssue[]
): void {
    for (const issue of issues) {
        ctx.issues.push({
            code: "custom",
            input: ctx.value,
            ...(issue.path !== undefined && { path: [...issue.path] }),
            message: issue.message
        });
    }
}

const optionIssues = (
    options: readonly { readonly value: string }[]
): readonly FieldIssue[] => {
    const issues: FieldIssue[] = [];
    const values = options.map(option => option.value);

    if (new Set(values).size !== values.length) {
        issues.push({ message: "values must be unique" });
    }
    if (values.includes(OTHER_OPTION_VALUE)) {
        issues.push({
            message: `"${OTHER_OPTION_VALUE}" is reserved for the free-text option`
        });
    }
    return issues;
};

const otherLabelIssues = (question: {
    readonly allowOther: boolean;
    readonly otherLabel?: unknown;
}): readonly FieldIssue[] =>
    question.allowOther && question.otherLabel === undefined
        ? [
              {
                  path: ["otherLabel"],
                  message: "required when allowOther is set"
              }
          ]
        : [];

const selectionIssues = (question: {
    readonly allowOther: boolean;
    readonly options: readonly unknown[];
    readonly minSelections?: number | undefined;
    readonly maxSelections?: number | undefined;
}): readonly FieldIssue[] => {
    const { minSelections: min, maxSelections: max } = question;
    const issues: FieldIssue[] = [];

    if (min !== undefined && max !== undefined && min > max) {
        issues.push({
            path: ["minSelections"],
            message: "cannot exceed maxSelections"
        });
    }

    const selectable = question.options.length + (question.allowOther ? 1 : 0);
    for (const [field, bound] of [
        ["minSelections", min],
        ["maxSelections", max]
    ] as const) {
        if (bound !== undefined && bound > selectable) {
            issues.push({
                path: [field],
                message: `cannot exceed the ${selectable} available selections`
            });
        }
    }
    return issues;
};

const optionList = <Option extends z.core.$ZodType<{ readonly value: string }>>(
    minimum: number,
    option: Option
) =>
    z
        .array(option)
        .min(minimum)
        .max(200)
        .check(ctx => report(ctx, optionIssues(ctx.value)));

const options = (minimum: number) => optionList(minimum, ChoiceOptionSchema);
const authoredOptions = (minimum: number) =>
    optionList(minimum, AuthoredChoiceOptionSchema);

// --- The fields -------------------------------------------------------------

const elementBase = {
    id: QuestionIdSchema,
    key: QuestionKeySchema,
    title: text(TEXT_MAX.title),
    description: z.string().max(TEXT_MAX.description).optional()
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
    otherLabel: text(TEXT_MAX.otherLabel).optional()
};

/**
 * The same fields, translated. Everything absent from these overrides — ids,
 * keys, option values, bounds, flags — is identical in both shapes and is
 * inherited rather than restated.
 */
const authoredText = {
    title: localizedTextSchema(TEXT_MAX.title),
    description: localizedTextSchema(TEXT_MAX.description).optional()
};

const authoredOtherText = {
    otherLabel: localizedTextSchema(TEXT_MAX.otherLabel).optional()
};

// --- The nine elements ------------------------------------------------------

export const StatementElementSchema = z.object({
    ...elementBase,
    type: z.literal("statement"),
    isAnswerable: z.literal(false).default(false)
});
const AuthoredStatementSchema = StatementElementSchema.extend(authoredText);

const singleChoiceFields = z.object({
    ...questionBase,
    ...otherFields,
    type: z.literal("single_choice"),
    options: options(2)
});
export const SingleChoiceQuestionSchema = singleChoiceFields.check(ctx =>
    report(ctx, otherLabelIssues(ctx.value))
);
const AuthoredSingleChoiceSchema = singleChoiceFields
    .extend({
        ...authoredText,
        ...authoredOtherText,
        options: authoredOptions(2)
    })
    .check(ctx => report(ctx, otherLabelIssues(ctx.value)));

const multiChoiceFields = z.object({
    ...questionBase,
    ...otherFields,
    type: z.literal("multi_choice"),
    options: options(2),
    minSelections: z.int().min(1).optional(),
    maxSelections: z.int().min(1).optional()
});
export const MultiChoiceQuestionSchema = multiChoiceFields.check(ctx =>
    report(ctx, [...otherLabelIssues(ctx.value), ...selectionIssues(ctx.value)])
);
const AuthoredMultiChoiceSchema = multiChoiceFields
    .extend({
        ...authoredText,
        ...authoredOtherText,
        options: authoredOptions(2)
    })
    .check(ctx =>
        report(ctx, [
            ...otherLabelIssues(ctx.value),
            ...selectionIssues(ctx.value)
        ])
    );

export const DropdownQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("dropdown"),
    options: options(2)
});
const AuthoredDropdownSchema = DropdownQuestionSchema.extend({
    ...authoredText,
    options: authoredOptions(2)
});

export const ShortTextQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("short_text"),
    maxLength: z.int().min(1).max(1_000).optional(),
    placeholder: text(TEXT_MAX.placeholder).optional()
});
const AuthoredShortTextSchema = ShortTextQuestionSchema.extend({
    ...authoredText,
    placeholder: localizedTextSchema(TEXT_MAX.placeholder).optional()
});

export const LongTextQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("long_text"),
    maxLength: z.int().min(1).max(10_000).optional(),
    placeholder: text(TEXT_MAX.placeholder).optional()
});
const AuthoredLongTextSchema = LongTextQuestionSchema.extend({
    ...authoredText,
    placeholder: localizedTextSchema(TEXT_MAX.placeholder).optional()
});

export const OpinionScaleQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("opinion_scale"),
    /** The scale runs 1..max. */
    max: z.int().min(2).max(OPINION_SCALE_MAX_STEPS),
    minLabel: text(TEXT_MAX.endpointLabel).optional(),
    maxLabel: text(TEXT_MAX.endpointLabel).optional()
});
const AuthoredOpinionScaleSchema = OpinionScaleQuestionSchema.extend({
    ...authoredText,
    minLabel: localizedTextSchema(TEXT_MAX.endpointLabel).optional(),
    maxLabel: localizedTextSchema(TEXT_MAX.endpointLabel).optional()
});

export const NpsQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("nps")
});
const AuthoredNpsSchema = NpsQuestionSchema.extend(authoredText);

export const MatrixSingleQuestionSchema = z.object({
    ...questionBase,
    type: z.literal("matrix_single"),
    rows: options(1),
    columns: options(2)
});
const AuthoredMatrixSingleSchema = MatrixSingleQuestionSchema.extend({
    ...authoredText,
    rows: authoredOptions(1),
    columns: authoredOptions(2)
});

/** One element in one language. */
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

/** One element as it is stored: every language the author has written. */
export const AuthoredElementSchema = z.discriminatedUnion("type", [
    AuthoredStatementSchema,
    AuthoredSingleChoiceSchema,
    AuthoredMultiChoiceSchema,
    AuthoredDropdownSchema,
    AuthoredShortTextSchema,
    AuthoredLongTextSchema,
    AuthoredOpinionScaleSchema,
    AuthoredNpsSchema,
    AuthoredMatrixSingleSchema
]);

export type SurveyElement = z.infer<typeof SurveyElementSchema>;
export type StatementElement = Extract<SurveyElement, { isAnswerable: false }>;
export type AnswerableQuestion = Extract<SurveyElement, { isAnswerable: true }>;

export type AuthoredElement = z.infer<typeof AuthoredElementSchema>;

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
