"use client";

import type { AnswerValueFor } from "@/domain/answer";
import type { MatrixSingleQuestion } from "@/domain/question";
import { OptionRow } from "@/components/runner/option-row";
import type { InputProps } from "@/components/runner/input-props";

type Answer = AnswerValueFor<"matrix_single">;

/**
 * A matrix, stacked rather than laid out as a grid: one labelled radio group
 * per row, each offering the columns as ordinary option rows.
 *
 * DESIGN.md §4 is explicit that the runner is one column with no side-by-side
 * controls, and a 380px baseline is the reason — a five-column grid on a phone
 * truncates every column label to nothing and gives each cell a target no
 * thumb can hit. It also makes the whole question navigable as what it
 * actually is: several single-choice questions sharing a scale. The builder's
 * canvas still previews the grid, which is the shape the *author* is editing;
 * see docs/DECISIONS.md 016.
 */
export function MatrixSingleInput({
    question,
    value,
    labelledBy,
    describedBy,
    // `invalid` is deliberately not destructured: ARIA does not support
    // aria-invalid on role="group", and the problem message this group already
    // points at with aria-describedby is what conveys the state instead.
    onChange
}: InputProps<MatrixSingleQuestion, Answer>) {
    const answers = value?.values ?? {};

    const select = (row: string, column: string) => {
        onChange({
            type: "matrix_single",
            values: { ...answers, [row]: column }
        });
    };

    return (
        <div
            role="group"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="flex flex-col gap-3"
        >
            {question.rows.map(row => {
                const rowLabelId = `${question.id}-${row.value}-label`;
                return (
                    <div key={row.value} className="flex flex-col gap-2">
                        <p
                            id={rowLabelId}
                            className="text-[14px] leading-[1.35] font-medium"
                        >
                            {row.label}
                        </p>
                        <div
                            role="radiogroup"
                            aria-labelledby={rowLabelId}
                            className="flex flex-col gap-2"
                        >
                            {question.columns.map(column => (
                                <OptionRow
                                    key={column.value}
                                    type="radio"
                                    name={`${question.id}-${row.value}`}
                                    value={column.value}
                                    checked={
                                        answers[row.value] === column.value
                                    }
                                    label={column.label}
                                    onSelect={() =>
                                        select(row.value, column.value)
                                    }
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
