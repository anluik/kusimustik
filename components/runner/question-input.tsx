"use client";

import type { AnswerValue } from "@/domain/answer";
import { isAnswerOfType } from "@/domain/answer";
import { assertNever } from "@/domain/assert-never";
import type { AnswerableQuestion } from "@/domain/question";
import { DropdownInput } from "@/components/runner/dropdown-input";
import { MatrixSingleInput } from "@/components/runner/matrix-input";
import { MultiChoiceInput } from "@/components/runner/multi-choice-input";
import { NpsInput, OpinionScaleInput } from "@/components/runner/scale-input";
import { SingleChoiceInput } from "@/components/runner/single-choice-input";
import { LongTextInput, ShortTextInput } from "@/components/runner/text-input";

/**
 * The one place the runner switches over the question union, ending in
 * `assertNever` — a ninth answerable type is a build error here as well as in
 * the builder's editor panel and preview.
 *
 * It is also where the stored envelope is narrowed. `isAnswerOfType` turns an
 * answer tagged for another question type into `null` rather than handing it
 * to an input that would misread it: that can only come from a draft written
 * before the definition changed, and starting the question afresh is the only
 * thing to do with one.
 */
export function QuestionInput({
    question,
    value,
    labelledBy,
    describedBy,
    invalid,
    onChange
}: {
    readonly question: AnswerableQuestion;
    readonly value: AnswerValue | null;
    readonly labelledBy: string;
    readonly describedBy: string | undefined;
    readonly invalid: boolean;
    readonly onChange: (value: AnswerValue | null) => void;
}) {
    const shared = { labelledBy, describedBy, invalid, onChange };

    switch (question.type) {
        case "single_choice":
            return (
                <SingleChoiceInput
                    {...shared}
                    question={question}
                    value={narrow(value, "single_choice")}
                />
            );

        case "multi_choice":
            return (
                <MultiChoiceInput
                    {...shared}
                    question={question}
                    value={narrow(value, "multi_choice")}
                />
            );

        case "dropdown":
            return (
                <DropdownInput
                    {...shared}
                    question={question}
                    value={narrow(value, "dropdown")}
                />
            );

        case "short_text":
            return (
                <ShortTextInput
                    {...shared}
                    question={question}
                    value={narrow(value, "short_text")}
                />
            );

        case "long_text":
            return (
                <LongTextInput
                    {...shared}
                    question={question}
                    value={narrow(value, "long_text")}
                />
            );

        case "opinion_scale":
            return (
                <OpinionScaleInput
                    {...shared}
                    question={question}
                    value={narrow(value, "opinion_scale")}
                />
            );

        case "nps":
            return (
                <NpsInput
                    {...shared}
                    question={question}
                    value={narrow(value, "nps")}
                />
            );

        case "matrix_single":
            return (
                <MatrixSingleInput
                    {...shared}
                    question={question}
                    value={narrow(value, "matrix_single")}
                />
            );

        default:
            return assertNever(question, "question type");
    }
}

function narrow<T extends AnswerValue["type"]>(
    value: AnswerValue | null,
    type: T
): Extract<AnswerValue, { type: T }> | null {
    return isAnswerOfType(value, type) ? value : null;
}
