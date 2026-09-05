import { z } from "zod";

import { assertNever } from "@/domain/assert-never";
import {
    NPS_MAX,
    NPS_MIN,
    OPINION_SCALE_MAX_STEPS,
    OPINION_SCALE_MIN,
    OTHER_OPTION_VALUE
} from "@/domain/question";
import type { AnswerableQuestion } from "@/domain/question";

/**
 * Answers are stored as a self-describing envelope tagged with the question
 * type they belong to. That keeps `answers.value` readable on its own in the
 * database, lets the exporter and aggregator narrow without consulting the
 * definition, and makes a question whose type was changed under a stored
 * answer fail loudly instead of silently mis-parsing.
 *
 * A skipped question is `null`, never `""` or `[]`.
 */

const trimmedText = z.string().trim();

/**
 * Structural validation only: shapes and universal bounds, with no knowledge of
 * any particular question. Use it to sanity-check stored rows. To validate an
 * answer *against its question* — options, selection limits, scale maximum,
 * matrix row coverage, required — use `buildAnswerSchema`.
 */
export const AnswerValueSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("single_choice"),
        value: z.string().min(1),
        other: trimmedText.min(1).optional()
    }),
    z.object({
        type: z.literal("multi_choice"),
        values: z.array(z.string().min(1)).min(1),
        other: trimmedText.min(1).optional()
    }),
    z.object({ type: z.literal("dropdown"), value: z.string().min(1) }),
    z.object({ type: z.literal("short_text"), value: trimmedText.min(1) }),
    z.object({ type: z.literal("long_text"), value: trimmedText.min(1) }),
    z.object({
        type: z.literal("opinion_scale"),
        value: z.int().min(OPINION_SCALE_MIN).max(OPINION_SCALE_MAX_STEPS)
    }),
    z.object({
        type: z.literal("nps"),
        value: z.int().min(NPS_MIN).max(NPS_MAX)
    }),
    z.object({
        type: z.literal("matrix_single"),
        values: z.record(z.string().min(1), z.string().min(1))
    })
]);

export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** The answer variant belonging to one question type. */
export type AnswerValueFor<T extends AnswerValue["type"]> = Extract<
    AnswerValue,
    { type: T }
>;

/** Narrows a stored answer to the variant a question of type `T` expects. */
export function isAnswerOfType<T extends AnswerValue["type"]>(
    answer: AnswerValue | null | undefined,
    type: T
): answer is AnswerValueFor<T> {
    return answer != null && answer.type === type;
}

/**
 * The load-bearing function: the schema an answer to `question` must satisfy.
 * Identical on the client (for form validation) and on the server (where it is
 * the only validation that counts).
 *
 * An optional question also accepts `null`. It does *not* accept a partial
 * answer — skipping is allowed, half-answering is not.
 */
export function buildAnswerSchema(
    question: AnswerableQuestion
): z.ZodType<AnswerValue | null> {
    const answered = buildAnsweredSchema(question);
    return question.required ? answered : answered.nullable();
}

function buildAnsweredSchema(
    question: AnswerableQuestion
): z.ZodType<AnswerValue> {
    switch (question.type) {
        case "single_choice": {
            const optionValues = new Set(
                question.options.map(option => option.value)
            );
            return z
                .object({
                    type: z.literal("single_choice"),
                    value: z.string(),
                    other: trimmedText.optional()
                })
                .check(ctx => {
                    const { value, other } = ctx.value;
                    if (value === OTHER_OPTION_VALUE) {
                        if (!question.allowOther) {
                            ctx.issues.push({
                                code: "custom",
                                input: ctx.value,
                                path: ["value"],
                                message: "this question has no free-text option"
                            });
                        } else if (other === undefined || other === "") {
                            ctx.issues.push({
                                code: "custom",
                                input: ctx.value,
                                path: ["other"],
                                message:
                                    "required when the free-text option is chosen"
                            });
                        }
                        return;
                    }
                    if (!optionValues.has(value)) {
                        ctx.issues.push({
                            code: "custom",
                            input: ctx.value,
                            path: ["value"],
                            message: "not one of this question's options"
                        });
                    }
                    if (other !== undefined) {
                        ctx.issues.push({
                            code: "custom",
                            input: ctx.value,
                            path: ["other"],
                            message: "only allowed with the free-text option"
                        });
                    }
                });
        }

        case "multi_choice": {
            const optionValues = new Set(
                question.options.map(option => option.value)
            );
            const selectable =
                question.options.length + (question.allowOther ? 1 : 0);
            const minimum = Math.max(1, question.minSelections ?? 1);
            const maximum = question.maxSelections ?? selectable;
            return z
                .object({
                    type: z.literal("multi_choice"),
                    values: z.array(z.string()),
                    other: trimmedText.optional()
                })
                .check(ctx => {
                    const { values, other } = ctx.value;
                    const push = (path: string, message: string) =>
                        ctx.issues.push({
                            code: "custom",
                            input: ctx.value,
                            path: [path],
                            message
                        });

                    if (new Set(values).size !== values.length)
                        push("values", "contains duplicates");
                    if (values.length < minimum)
                        push("values", `select at least ${minimum}`);
                    if (values.length > maximum)
                        push("values", `select at most ${maximum}`);

                    for (const value of values) {
                        if (
                            value !== OTHER_OPTION_VALUE &&
                            !optionValues.has(value)
                        ) {
                            push(
                                "values",
                                `"${value}" is not one of this question's options`
                            );
                        }
                    }

                    const chosenOther = values.includes(OTHER_OPTION_VALUE);
                    if (chosenOther && !question.allowOther) {
                        push("values", "this question has no free-text option");
                    } else if (
                        chosenOther &&
                        (other === undefined || other === "")
                    ) {
                        push(
                            "other",
                            "required when the free-text option is chosen"
                        );
                    } else if (!chosenOther && other !== undefined) {
                        push("other", "only allowed with the free-text option");
                    }
                });
        }

        case "dropdown": {
            const optionValues = question.options.map(option => option.value);
            return z.object({
                type: z.literal("dropdown"),
                value: z.literal(optionValues)
            });
        }

        case "short_text":
            return z.object({
                type: z.literal("short_text"),
                value: trimmedText.min(1).max(question.maxLength ?? 1_000)
            });

        case "long_text":
            return z.object({
                type: z.literal("long_text"),
                value: trimmedText.min(1).max(question.maxLength ?? 10_000)
            });

        case "opinion_scale":
            return z.object({
                type: z.literal("opinion_scale"),
                value: z.int().min(OPINION_SCALE_MIN).max(question.max)
            });

        case "nps":
            return z.object({
                type: z.literal("nps"),
                value: z.int().min(NPS_MIN).max(NPS_MAX)
            });

        case "matrix_single": {
            const rowValues = new Set(question.rows.map(row => row.value));
            const columnValues = new Set(
                question.columns.map(column => column.value)
            );
            return z
                .object({
                    type: z.literal("matrix_single"),
                    values: z.record(z.string(), z.string())
                })
                .check(ctx => {
                    const answers = ctx.value.values;
                    const push = (path: string, message: string) =>
                        ctx.issues.push({
                            code: "custom",
                            input: ctx.value,
                            path: ["values", path],
                            message
                        });

                    // Every row must be answered: a partial matrix is not a valid answer,
                    // whether or not the question is required.
                    for (const row of question.rows) {
                        if (answers[row.value] === undefined)
                            push(row.value, "row not answered");
                    }
                    for (const [row, column] of Object.entries(answers)) {
                        if (!rowValues.has(row)) {
                            push(row, "not one of this question's rows");
                        } else if (!columnValues.has(column)) {
                            push(
                                row,
                                `"${column}" is not one of this question's columns`
                            );
                        }
                    }
                });
        }

        default:
            return assertNever(question, "question type");
    }
}
