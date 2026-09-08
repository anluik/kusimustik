import { assertNever } from "@/domain/assert-never";
import { isAnswerOfType } from "@/domain/answer";
import type { AnswerValue } from "@/domain/answer";
import {
    NPS_MAX,
    NPS_MIN,
    OPINION_SCALE_MIN,
    OTHER_OPTION_VALUE
} from "@/domain/question";
import type {
    AnswerableQuestion,
    AnswerableQuestionType
} from "@/domain/question";
import type { QuestionId } from "@/domain/ids";

/**
 * Turns the answers to one question into the shape its chart needs.
 *
 * The input array is one entry per response *considered*, with `null` for a
 * skip — that is what makes `responseCount` a meaningful denominator. All
 * percentages are taken against `answeredCount` (not `responseCount`), which is
 * the survey-reporting convention; `skippedCount` is reported separately so a
 * card can show "5 of 20 skipped" alongside.
 *
 * Percentages are rounded to one decimal and so need not total exactly 100.
 * For `multi_choice` they deliberately total more than 100: each is the share
 * of respondents who picked that option.
 */

export type SummaryBase = {
    readonly questionId: QuestionId;
    readonly questionKey: string;
    readonly questionType: AnswerableQuestionType;
    readonly title: string;
    readonly responseCount: number;
    readonly answeredCount: number;
    readonly skippedCount: number;
    /**
     * Answers counted in `answeredCount` that nothing below represents.
     *
     * An option, a matrix row or column, or the top of a scale can be taken
     * out of a question that has already been answered. The answer keeps the
     * value it was given — `toCsvCells` still writes it out — but the question
     * no longer describes it, so no bar can. Reporting it is what stops the
     * card's own arithmetic silently disagreeing with itself.
     *
     * It counts answers rather than choices: one respondent who picked two
     * removed options is one unshown answer.
     */
    readonly unshownCount: number;
};

export type CategoryCount = {
    readonly value: string;
    readonly label: string;
    readonly count: number;
    readonly percentage: number;
};

export type OtherBucket = {
    readonly label: string | null;
    readonly count: number;
    readonly percentage: number;
    readonly responses: readonly string[];
};

export type CategoricalSummary = SummaryBase & {
    readonly kind: "categorical";
    /** True for `multi_choice`, where percentages sum past 100 by design. */
    readonly multiSelect: boolean;
    readonly options: readonly CategoryCount[];
    /** Null unless the question offers a free-text "other" option. */
    readonly other: OtherBucket | null;
};

export type NumericBucket = {
    readonly value: number;
    readonly count: number;
    readonly percentage: number;
};

export type NumericSummary = SummaryBase & {
    readonly kind: "numeric";
    readonly min: number;
    readonly max: number;
    readonly minLabel: string | null;
    readonly maxLabel: string | null;
    /** Null when nobody answered. */
    readonly mean: number | null;
    readonly median: number | null;
    /** One bucket per step, including the empty ones, so bar charts line up. */
    readonly distribution: readonly NumericBucket[];
};

export type NpsSummary = SummaryBase & {
    readonly kind: "nps";
    readonly promoters: number;
    readonly passives: number;
    readonly detractors: number;
    /** Promoter share minus detractor share, -100..100. Null with no answers. */
    readonly score: number | null;
    readonly mean: number | null;
    readonly median: number | null;
    readonly distribution: readonly NumericBucket[];
};

export type TextSummary = SummaryBase & {
    readonly kind: "text";
    readonly responses: readonly string[];
};

export type MatrixRowSummary = {
    readonly value: string;
    readonly label: string;
    readonly answeredCount: number;
    readonly cells: readonly CategoryCount[];
};

export type MatrixSummary = SummaryBase & {
    readonly kind: "matrix";
    readonly columns: readonly {
        readonly value: string;
        readonly label: string;
    }[];
    readonly rows: readonly MatrixRowSummary[];
};

export type QuestionSummary =
    | CategoricalSummary
    | NumericSummary
    | NpsSummary
    | TextSummary
    | MatrixSummary;

export function aggregate(
    question: AnswerableQuestion,
    answers: readonly (AnswerValue | null)[]
): QuestionSummary {
    switch (question.type) {
        case "single_choice": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "single_choice")
            );
            const offered = offeredValues(
                question.options,
                question.allowOther
            );
            const base = summaryBase(
                question,
                answers.length,
                given.length,
                given.filter(answer => !offered.has(answer.value)).length
            );
            const counts = new Map(
                question.options.map(option => [option.value, 0])
            );
            const otherResponses: string[] = [];

            for (const answer of given) {
                if (answer.value === OTHER_OPTION_VALUE) {
                    if (answer.other !== undefined)
                        otherResponses.push(answer.other);
                    continue;
                }
                counts.set(answer.value, (counts.get(answer.value) ?? 0) + 1);
            }

            return {
                ...base,
                kind: "categorical",
                multiSelect: false,
                options: question.options.map(option =>
                    category(
                        option,
                        counts.get(option.value) ?? 0,
                        given.length
                    )
                ),
                other: question.allowOther
                    ? otherBucket(
                          question.otherLabel ?? null,
                          otherResponses,
                          given.length
                      )
                    : null
            };
        }

        case "multi_choice": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "multi_choice")
            );
            const offered = offeredValues(
                question.options,
                question.allowOther
            );
            const base = summaryBase(
                question,
                answers.length,
                given.length,
                given.filter(answer =>
                    answer.values.some(value => !offered.has(value))
                ).length
            );
            const counts = new Map(
                question.options.map(option => [option.value, 0])
            );
            const otherResponses: string[] = [];

            for (const answer of given) {
                for (const value of answer.values) {
                    if (value === OTHER_OPTION_VALUE) {
                        if (answer.other !== undefined)
                            otherResponses.push(answer.other);
                        continue;
                    }
                    counts.set(value, (counts.get(value) ?? 0) + 1);
                }
            }

            return {
                ...base,
                kind: "categorical",
                multiSelect: true,
                options: question.options.map(option =>
                    category(
                        option,
                        counts.get(option.value) ?? 0,
                        given.length
                    )
                ),
                other: question.allowOther
                    ? otherBucket(
                          question.otherLabel ?? null,
                          otherResponses,
                          given.length
                      )
                    : null
            };
        }

        case "dropdown": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "dropdown")
            );
            // A dropdown has no "other", so anything off the list is unshown.
            const offered = offeredValues(question.options, false);
            const counts = new Map(
                question.options.map(option => [option.value, 0])
            );
            for (const answer of given)
                counts.set(answer.value, (counts.get(answer.value) ?? 0) + 1);

            return {
                ...summaryBase(
                    question,
                    answers.length,
                    given.length,
                    given.filter(answer => !offered.has(answer.value)).length
                ),
                kind: "categorical",
                multiSelect: false,
                options: question.options.map(option =>
                    category(
                        option,
                        counts.get(option.value) ?? 0,
                        given.length
                    )
                ),
                other: null
            };
        }

        case "short_text": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "short_text")
            );
            return {
                // Nothing was chosen from a list, so nothing can be taken out
                // from under it.
                ...summaryBase(question, answers.length, given.length, 0),
                kind: "text",
                responses: given.map(answer => answer.value)
            };
        }

        case "long_text": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "long_text")
            );
            return {
                // Nothing was chosen from a list, so nothing can be taken out
                // from under it.
                ...summaryBase(question, answers.length, given.length, 0),
                kind: "text",
                responses: given.map(answer => answer.value)
            };
        }

        case "opinion_scale": {
            const scores = answers
                .filter(answer => isAnswerOfType(answer, "opinion_scale"))
                .map(answer => answer.value);

            return {
                ...summaryBase(
                    question,
                    answers.length,
                    scores.length,
                    // Lowering `max` leaves the scores above it with no step
                    // to sit on; they stay in the mean, which is the whole
                    // reason the card has to say they are there.
                    scores.filter(
                        score =>
                            score < OPINION_SCALE_MIN || score > question.max
                    ).length
                ),
                kind: "numeric",
                min: OPINION_SCALE_MIN,
                max: question.max,
                minLabel: question.minLabel ?? null,
                maxLabel: question.maxLabel ?? null,
                mean: mean(scores),
                median: median(scores),
                distribution: distribution(
                    scores,
                    OPINION_SCALE_MIN,
                    question.max
                )
            };
        }

        case "nps": {
            const scores = answers
                .filter(answer => isAnswerOfType(answer, "nps"))
                .map(answer => answer.value);

            // The standard split: 0-6 detract, 7-8 are passive, 9-10 promote.
            const detractors = scores.filter(score => score <= 6).length;
            const passives = scores.filter(
                score => score === 7 || score === 8
            ).length;
            const promoters = scores.filter(score => score >= 9).length;

            return {
                // 0-10 is fixed by the type, so no answer can fall off it.
                ...summaryBase(question, answers.length, scores.length, 0),
                kind: "nps",
                promoters,
                passives,
                detractors,
                score:
                    scores.length === 0
                        ? null
                        : round(
                              ((promoters - detractors) / scores.length) * 100,
                              1
                          ),
                mean: mean(scores),
                median: median(scores),
                distribution: distribution(scores, NPS_MIN, NPS_MAX)
            };
        }

        case "matrix_single": {
            const given = answers.filter(answer =>
                isAnswerOfType(answer, "matrix_single")
            );
            const columnValues = new Set(
                question.columns.map(column => column.value)
            );
            const rowValues = new Set(question.rows.map(row => row.value));

            return {
                ...summaryBase(
                    question,
                    answers.length,
                    given.length,
                    // Either half of the grid can be edited away, and a cell
                    // needs both halves to be drawable.
                    given.filter(answer =>
                        Object.entries(answer.values).some(
                            ([row, column]) =>
                                !rowValues.has(row) || !columnValues.has(column)
                        )
                    ).length
                ),
                kind: "matrix",
                columns: question.columns.map(column => ({
                    value: column.value,
                    label: column.label
                })),
                rows: question.rows.map(row => {
                    const chosen = given
                        .map(answer => answer.values[row.value])
                        .filter(
                            (value): value is string =>
                                value !== undefined && columnValues.has(value)
                        );
                    const counts = new Map(
                        question.columns.map(column => [column.value, 0])
                    );
                    for (const value of chosen)
                        counts.set(value, (counts.get(value) ?? 0) + 1);

                    return {
                        value: row.value,
                        label: row.label,
                        answeredCount: chosen.length,
                        cells: question.columns.map(column =>
                            category(
                                column,
                                counts.get(column.value) ?? 0,
                                chosen.length
                            )
                        )
                    };
                })
            };
        }

        default:
            return assertNever(question, "question type");
    }
}

function summaryBase(
    question: AnswerableQuestion,
    responseCount: number,
    answeredCount: number,
    /** Required rather than defaulted: a tenth question type has to decide
     *  what "a choice this question no longer offers" means for it. */
    unshownCount: number
): SummaryBase {
    return {
        questionId: question.id,
        questionKey: question.key,
        questionType: question.type,
        title: question.title,
        responseCount,
        answeredCount,
        skippedCount: responseCount - answeredCount,
        unshownCount
    };
}

/**
 * Every value a choice question would accept from a respondent today.
 *
 * `OTHER_OPTION_VALUE` belongs in it only while the question still offers a
 * written answer: turning "other" off leaves the answers that used it with
 * nowhere to appear, exactly as removing a listed option does.
 */
function offeredValues(
    options: readonly { readonly value: string }[],
    allowOther: boolean
): ReadonlySet<string> {
    const values = new Set(options.map(option => option.value));
    if (allowOther) values.add(OTHER_OPTION_VALUE);
    return values;
}

function category(
    option: { readonly value: string; readonly label: string },
    count: number,
    total: number
): CategoryCount {
    return {
        value: option.value,
        label: option.label,
        count,
        percentage: share(count, total)
    };
}

function otherBucket(
    label: string | null,
    responses: readonly string[],
    total: number
): OtherBucket {
    return {
        label,
        count: responses.length,
        percentage: share(responses.length, total),
        responses
    };
}

function distribution(
    scores: readonly number[],
    min: number,
    max: number
): NumericBucket[] {
    const buckets: NumericBucket[] = [];
    for (let value = min; value <= max; value += 1) {
        const count = scores.filter(score => score === value).length;
        buckets.push({ value, count, percentage: share(count, scores.length) });
    }
    return buckets;
}

function share(count: number, total: number): number {
    return total === 0 ? 0 : round((count / total) * 100, 1);
}

function mean(scores: readonly number[]): number | null {
    if (scores.length === 0) return null;
    return round(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
        2
    );
}

function median(scores: readonly number[]): number | null {
    if (scores.length === 0) return null;
    const sorted = [...scores].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted[middle - 1];
    const upper = sorted[middle];
    if (upper === undefined) return null;
    return sorted.length % 2 === 1 || lower === undefined
        ? upper
        : round((lower + upper) / 2, 2);
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
