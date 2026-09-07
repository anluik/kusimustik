"use client";

import { useTranslations } from "next-intl";

import type { AnswerValue } from "@/domain/answer";
import type { SurveyElement } from "@/domain/question";
import { isAnswerableElement } from "@/domain/question";
import { QuestionInput } from "@/components/runner/question-input";
import type { AnswerProblem } from "@/lib/runner/validation";
import { cn } from "@/lib/utils";

/**
 * One card per element (DESIGN.md §4: 16/14 padding, 6px radius, one question
 * group per card, one column).
 *
 * The heading is a real `h2` and the control group points at it with
 * `aria-labelledby`, rather than the card being a `section` with an accessible
 * name — nine landmark regions on one page is noise, and the group semantics
 * that matter belong to the radios, not to the card around them.
 *
 * Respondent-facing text stays at 14px or above (§2), so required-ness is an
 * asterisk with a screen-reader word rather than a 9px mono tag: the owner
 * chrome may go that small, this surface may not.
 */
export function QuestionCard({
    element,
    index,
    value,
    problem,
    onChange,
    cardRef
}: {
    readonly element: SurveyElement;
    /** Position among answerable questions; 0 for a statement. */
    readonly index: number;
    readonly value: AnswerValue | null;
    /** Non-null once the respondent should see what is wrong. */
    readonly problem: AnswerProblem | null;
    readonly onChange: (value: AnswerValue | null) => void;
    readonly cardRef: (node: Element | null) => void;
}) {
    const t = useTranslations("RunnerShell");
    const question = useTranslations("RunnerQuestion");
    const problems = useTranslations("RunnerProblems");

    const titleId = `${element.id}-title`;
    const helpId = `${element.id}-help`;
    const problemId = `${element.id}-problem`;

    const describedBy =
        [
            element.description !== undefined ? helpId : null,
            problem !== null ? problemId : null
        ]
            .filter(part => part !== null)
            .join(" ") || undefined;

    if (!isAnswerableElement(element)) {
        return (
            <article
                ref={cardRef}
                className="flex flex-col gap-2 rounded-survey border bg-survey-card px-3.5 py-4"
            >
                <h2 className="text-[15px] leading-[1.4] font-medium">
                    {element.title}
                </h2>
                {element.description !== undefined && (
                    <p className="text-[14px] leading-[1.35] text-muted-foreground">
                        {element.description}
                    </p>
                )}
            </article>
        );
    }

    return (
        <article
            ref={cardRef}
            id={cardId(element.id)}
            tabIndex={-1}
            className={cn(
                "flex flex-col gap-3 rounded-survey border bg-survey-card px-3.5 py-4 outline-none",
                "focus-visible:ring-[3px] focus-visible:ring-ring/18",
                problem !== null && "border-destructive"
            )}
        >
            <div className="flex flex-col gap-1">
                <h2
                    id={titleId}
                    className="text-[15px] leading-[1.4] font-medium"
                >
                    <span className="mr-1.5 font-mono text-muted-foreground">
                        {index}.
                    </span>
                    {element.title}
                    {element.required ? (
                        <>
                            <span aria-hidden className="ml-1 text-destructive">
                                *
                            </span>
                            <span className="sr-only"> {t("required")}</span>
                        </>
                    ) : (
                        <span className="ml-1.5 text-[14px] font-normal text-muted-foreground">
                            {t("optional")}
                        </span>
                    )}
                </h2>
                {element.description !== undefined && (
                    <p
                        id={helpId}
                        className="text-[14px] leading-[1.35] text-muted-foreground"
                    >
                        {element.description}
                    </p>
                )}
            </div>

            <QuestionInput
                question={element}
                value={value}
                labelledBy={titleId}
                describedBy={describedBy}
                invalid={problem !== null}
                onChange={onChange}
            />

            {problem !== null && (
                <p
                    id={problemId}
                    className="flex items-start gap-1.5 text-[14px] leading-[1.35] text-destructive"
                >
                    <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-4xl bg-destructive"
                    />
                    {/* The code carries whatever number its message needs;
                        `invalid` and `required` simply ignore the value. */}
                    {problems(problem.code, {
                        count: "count" in problem ? problem.count : 0
                    })}
                </p>
            )}

            {!element.required && value !== null && (
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="self-start rounded-survey px-1 py-1 text-[14px] leading-[1.35] text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/18"
                >
                    {question("clear")}
                </button>
            )}
        </article>
    );
}

/** Where the submit scrolls to when this question is what is blocking it. */
export function cardId(questionId: string): string {
    return `q-${questionId}`;
}
