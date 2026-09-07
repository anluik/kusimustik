import { isAnswerOfType } from "@/domain/answer";
import type { AnswerValue } from "@/domain/answer";
import { assertNever } from "@/domain/assert-never";
import type { QuestionId, ResponseId } from "@/domain/ids";
import {
    NPS_MAX,
    NPS_MIN,
    OPINION_SCALE_MIN,
    OTHER_OPTION_VALUE,
    isAnswerableElement
} from "@/domain/question";
import type { AnswerableQuestion, SurveyElement } from "@/domain/question";
import type { ResponseRecord } from "@/lib/db/responses";

/**
 * The individual-responses table: one row per submission, one column per
 * question.
 *
 * Deliberately *not* the CSV's shape. `toCsvColumns` fans a multi-choice out to
 * one flag column per option so a machine can read it; a person reading one
 * respondent's answers wants "Email, Slack" in a single cell. Phase 8's export
 * keeps the wide shape, and both are driven from the same question, so they
 * cannot disagree about what was answered — only about how it is laid out.
 *
 * Answers are returned structured rather than pre-joined into a string. The
 * separators are punctuation and belong in the JSX; the labels are the author's
 * own words and belong to the data. A `toText` here would have to invent both.
 */

export type AnswerDisplay =
    /** Skipped, or an answer stored against a question whose type has changed. */
    | { readonly kind: "empty" }
    | { readonly kind: "text"; readonly text: string }
    /** Selected option labels, in the question's own order. */
    | { readonly kind: "list"; readonly items: readonly string[] }
    | {
          readonly kind: "score";
          readonly value: number;
          readonly min: number;
          readonly max: number;
      }
    | {
          readonly kind: "pairs";
          readonly pairs: readonly {
              readonly key: string;
              readonly label: string;
              readonly value: string;
          }[];
      };

export type ResponseRow = {
    readonly id: ResponseId;
    readonly submittedAt: string;
    readonly locale: string | null;
    /** The definition this respondent actually saw. */
    readonly surveyVersion: number;
    readonly cells: ReadonlyMap<QuestionId, AnswerDisplay>;
    /**
     * Everything in the row a search could reasonably match, lowercased and
     * joined. Precomputed per row rather than derived per keystroke, and kept
     * out of the rendering so the search matches the *answers* rather than
     * whatever the current locale happens to have formatted them into.
     */
    readonly searchText: string;
};

const EMPTY: AnswerDisplay = { kind: "empty" };

/**
 * One question's answer, ready to render.
 *
 * Total, like `toCsvCells`: every question yields a display for every response,
 * so the table stays rectangular however much is missing. Labels fall back to
 * the stored value when an option has since been deleted, so an old response
 * never renders blank for an answer someone really gave.
 */
export function toAnswerDisplay(
    question: AnswerableQuestion,
    answer: AnswerValue | null
): AnswerDisplay {
    switch (question.type) {
        case "single_choice": {
            const given = isAnswerOfType(answer, "single_choice")
                ? answer
                : null;
            if (given === null) return EMPTY;
            if (given.value === OTHER_OPTION_VALUE) {
                // The typed text is the answer; the label only says it was the
                // free-text option that produced it.
                return given.other === undefined || given.other === ""
                    ? { kind: "list", items: [question.otherLabel ?? ""] }
                    : { kind: "text", text: given.other };
            }
            return {
                kind: "list",
                items: [labelOf(question.options, given.value)]
            };
        }

        case "multi_choice": {
            const given = isAnswerOfType(answer, "multi_choice")
                ? answer
                : null;
            if (given === null) return EMPTY;

            const selected = new Set(given.values);
            // Iterate the question, not the answer: the author's order is the
            // one the respondent saw, and the stored array's order is not
            // meaningful.
            const items = question.options
                .filter(option => selected.has(option.value))
                .map(option => option.label);

            if (selected.has(OTHER_OPTION_VALUE)) {
                items.push(
                    given.other === undefined || given.other === ""
                        ? (question.otherLabel ?? "")
                        : given.other
                );
            }
            return items.length === 0 ? EMPTY : { kind: "list", items };
        }

        case "dropdown": {
            const given = isAnswerOfType(answer, "dropdown") ? answer : null;
            return given === null
                ? EMPTY
                : {
                      kind: "list",
                      items: [labelOf(question.options, given.value)]
                  };
        }

        case "short_text":
        case "long_text": {
            const given = isAnswerOfType(answer, question.type) ? answer : null;
            return given === null || given.value === ""
                ? EMPTY
                : { kind: "text", text: given.value };
        }

        case "opinion_scale": {
            const given = isAnswerOfType(answer, "opinion_scale")
                ? answer
                : null;
            return given === null
                ? EMPTY
                : {
                      kind: "score",
                      value: given.value,
                      min: OPINION_SCALE_MIN,
                      max: question.max
                  };
        }

        case "nps": {
            const given = isAnswerOfType(answer, "nps") ? answer : null;
            return given === null
                ? EMPTY
                : {
                      kind: "score",
                      value: given.value,
                      min: NPS_MIN,
                      max: NPS_MAX
                  };
        }

        case "matrix_single": {
            const given = isAnswerOfType(answer, "matrix_single")
                ? answer
                : null;
            if (given === null) return EMPTY;

            const pairs = question.rows
                .map(row => {
                    const chosen = given.values[row.value];
                    return chosen === undefined
                        ? null
                        : {
                              key: row.value,
                              label: row.label,
                              value: labelOf(question.columns, chosen)
                          };
                })
                .filter(pair => pair !== null);

            return pairs.length === 0 ? EMPTY : { kind: "pairs", pairs };
        }

        default:
            return assertNever(question, "question type");
    }
}

/** The answerable questions of a survey, in document order. */
export function tableQuestions(
    elements: readonly SurveyElement[]
): readonly AnswerableQuestion[] {
    return elements.filter(isAnswerableElement);
}

export function buildResponseRows(
    elements: readonly SurveyElement[],
    responses: readonly ResponseRecord[]
): readonly ResponseRow[] {
    const questions = tableQuestions(elements);

    return responses.map(response => {
        const cells = new Map(
            questions.map(question => [
                question.id,
                toAnswerDisplay(question, response.answers[question.id] ?? null)
            ])
        );

        return {
            id: response.id,
            submittedAt: response.submittedAt,
            locale: response.locale,
            surveyVersion: response.surveyVersion,
            cells,
            searchText: [...cells.values()]
                .flatMap(searchableParts)
                .join(" ")
                .toLowerCase()
        };
    });
}

/** Case- and whitespace-insensitive; an empty query matches everything. */
export function matchesResponseSearch(
    row: ResponseRow,
    query: string
): boolean {
    const needle = query.trim().toLowerCase();
    return needle === "" || row.searchText.includes(needle);
}

function searchableParts(display: AnswerDisplay): readonly string[] {
    switch (display.kind) {
        case "empty":
            return [];
        case "text":
            return [display.text];
        case "list":
            return display.items;
        case "score":
            // The number as stored. "4" finds it; "4 of 5" is presentation.
            return [String(display.value)];
        case "pairs":
            return display.pairs.flatMap(pair => [pair.label, pair.value]);
        default:
            return assertNever(display, "answer display");
    }
}

/**
 * An option's label, falling back to the stored value when the option has been
 * deleted since. Never blank: a respondent did choose something, and a table
 * that hides it is worse than one that shows a raw value.
 */
function labelOf(
    options: readonly { readonly value: string; readonly label: string }[],
    value: string
): string {
    return options.find(option => option.value === value)?.label ?? value;
}
