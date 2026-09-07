import { aggregate } from "@/domain/aggregate";
import type { QuestionSummary } from "@/domain/aggregate";
import type { AnswerableQuestion, SurveyElement } from "@/domain/question";
import { answersForQuestion } from "@/lib/db/responses";
import type { ResponseRecord } from "@/lib/db/responses";
import { tableQuestions } from "@/lib/results/response-table";

/**
 * The per-question cards' data: every answerable element of the document,
 * paired with the summary of what people answered.
 *
 * Driven from `elements` rather than from the answers, so a question nobody
 * answered still gets a card showing nought — the absence is the finding.
 * `answersForQuestion` keeps the whole response list as the denominator, which
 * is what makes `skippedCount` mean anything.
 */

export type QuestionResult = {
    readonly question: AnswerableQuestion;
    readonly summary: QuestionSummary;
};

export function buildQuestionResults(
    elements: readonly SurveyElement[],
    responses: readonly ResponseRecord[]
): readonly QuestionResult[] {
    return tableQuestions(elements).map(question => ({
        question,
        summary: aggregate(question, answersForQuestion(responses, question.id))
    }));
}
