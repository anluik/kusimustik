import type { AnswerValue } from "@/domain/answer";
import { buildAnswerSchema, isAnswerOfType } from "@/domain/answer";
import { assertNever } from "@/domain/assert-never";
import type { QuestionId } from "@/domain/ids";
import type { AnswerableQuestion, SurveyElement } from "@/domain/question";
import { OTHER_OPTION_VALUE, isAnswerableElement } from "@/domain/question";

/**
 * Respondent-facing validation, which is the half `domain/` deliberately does
 * not have: `buildAnswerSchema` decides *whether* an answer is acceptable, and
 * its messages are developer-facing English (docs/DECISIONS.md 007). This
 * module decides *what to tell the respondent*, as a code the runner's message
 * catalogue has copy for — so `domain/` never grows an i18n dependency and the
 * wording lives with every other string.
 *
 * `buildAnswerSchema` stays the authority: nothing here can call an answer
 * valid that it rejects, or invalid that it accepts. The classification below
 * only names a failure it has already found.
 */

/** One reason an answer is not acceptable. Each maps to `RunnerProblems.*`. */
export type AnswerProblem =
    | { readonly code: "required" }
    | { readonly code: "selectAtLeast"; readonly count: number }
    | { readonly code: "selectAtMost"; readonly count: number }
    | { readonly code: "otherRequired" }
    /** How many matrix rows are still unanswered. */
    | { readonly code: "matrixIncomplete"; readonly count: number }
    | { readonly code: "tooLong"; readonly count: number }
    /** Nothing more specific — a stale draft, or a hand-made request. */
    | { readonly code: "invalid" };

/**
 * What the respondent has answered so far, keyed by question id. An absent key
 * is a question they have not reached; an explicit `null` is one they cleared.
 * Both are "no answer", which is why the getter below flattens them.
 */
export type AnswerDraft = Readonly<
    Partial<Record<QuestionId, AnswerValue | null>>
>;

export function draftAnswer(
    draft: AnswerDraft,
    questionId: QuestionId
): AnswerValue | null {
    return draft[questionId] ?? null;
}

export function validateAnswer(
    question: AnswerableQuestion,
    value: AnswerValue | null
): AnswerProblem | null {
    if (buildAnswerSchema(question).safeParse(value).success) return null;
    // Past this point the answer is definitely unacceptable; all that is left
    // is to say why in words a respondent can act on.
    if (value === null) return { code: "required" };
    return classify(question, value) ?? { code: "invalid" };
}

/** Every answerable question that is not acceptable, in document order. */
export function validateAll(
    elements: readonly SurveyElement[],
    draft: AnswerDraft
): readonly {
    readonly question: AnswerableQuestion;
    readonly problem: AnswerProblem;
}[] {
    return elements.filter(isAnswerableElement).flatMap(question => {
        const problem = validateAnswer(
            question,
            draftAnswer(draft, question.id)
        );
        return problem === null ? [] : [{ question, problem }];
    });
}

/**
 * Progress, counted over answerable elements only — a statement block is not
 * something a respondent can be part-way through. An answer that is present
 * but unacceptable still counts as unanswered, so the bar never reaches the
 * end while something is still blocking the submit.
 */
export function answerProgress(
    elements: readonly SurveyElement[],
    draft: AnswerDraft
): { readonly answered: number; readonly total: number } {
    const questions = elements.filter(isAnswerableElement);
    const answered = questions.filter(question => {
        const value = draftAnswer(draft, question.id);
        return value !== null && validateAnswer(question, value) === null;
    }).length;
    return { answered, total: questions.length };
}

/**
 * Names the failure. Returns `null` when nothing specific applies — the caller
 * turns that into `invalid`, which is what a mistyped envelope from a stale
 * draft or a hand-made request deserves.
 */
function classify(
    question: AnswerableQuestion,
    value: AnswerValue
): AnswerProblem | null {
    switch (question.type) {
        case "single_choice": {
            if (!isAnswerOfType(value, "single_choice")) return null;
            return value.value === OTHER_OPTION_VALUE &&
                question.allowOther &&
                isBlank(value.other)
                ? { code: "otherRequired" }
                : null;
        }

        case "multi_choice": {
            if (!isAnswerOfType(value, "multi_choice")) return null;
            const { minSelections, maxSelections } = question;
            if (
                value.values.includes(OTHER_OPTION_VALUE) &&
                question.allowOther &&
                isBlank(value.other)
            ) {
                return { code: "otherRequired" };
            }
            if (
                minSelections !== undefined &&
                value.values.length < minSelections
            ) {
                return { code: "selectAtLeast", count: minSelections };
            }
            if (
                maxSelections !== undefined &&
                value.values.length > maxSelections
            ) {
                return { code: "selectAtMost", count: maxSelections };
            }
            return null;
        }

        case "short_text":
        case "long_text": {
            if (!isAnswerOfType(value, question.type)) return null;
            const text = value.value.trim();
            if (text === "") return { code: "required" };
            const limit = question.maxLength;
            return limit !== undefined && text.length > limit
                ? { code: "tooLong", count: limit }
                : null;
        }

        case "matrix_single": {
            if (!isAnswerOfType(value, "matrix_single")) return null;
            const missing = question.rows.filter(
                row => value.values[row.value] === undefined
            ).length;
            return missing === 0
                ? null
                : { code: "matrixIncomplete", count: missing };
        }

        // Nothing a respondent can do wrong that the control itself allows: the
        // dropdown offers only real options and the scales only real steps, so
        // any failure here came from outside the runner.
        case "dropdown":
        case "opinion_scale":
        case "nps":
            return null;

        default:
            return assertNever(question, "question type");
    }
}

function isBlank(text: string | undefined): boolean {
    return text === undefined || text.trim() === "";
}
