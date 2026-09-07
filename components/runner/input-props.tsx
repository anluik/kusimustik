import type { AnswerValue } from "@/domain/answer";
import type { AnswerableQuestion } from "@/domain/question";

/**
 * What every runner input takes. The answer is already narrowed to the variant
 * the question expects — `question-input.tsx` does that once, in the switch
 * that also proves the union is covered — so no input has to re-check the tag
 * it was handed.
 *
 * `null` means unanswered in both directions: a control that clears itself
 * reports `null` rather than an empty envelope, which is what keeps a skipped
 * question out of the `answers` table entirely (docs/DECISIONS.md 007).
 */
export type InputProps<
    TQuestion extends AnswerableQuestion,
    TAnswer extends AnswerValue
> = {
    readonly question: TQuestion;
    readonly value: TAnswer | null;
    /** The question's heading, which labels the control group. */
    readonly labelledBy: string;
    /** Its help text and, once shown, its problem message. */
    readonly describedBy: string | undefined;
    readonly invalid: boolean;
    readonly onChange: (value: TAnswer | null) => void;
};
