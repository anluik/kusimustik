import { assertNever } from "@/domain/assert-never";
import { isAnswerOfType } from "@/domain/answer";
import type { AnswerValue } from "@/domain/answer";
import { OTHER_OPTION_VALUE } from "@/domain/question";
import type { AnswerableQuestion } from "@/domain/question";
import type { QuestionId } from "@/domain/ids";

/**
 * One question becomes one or more CSV columns; one answer becomes exactly that
 * many cells. `toCsvCells` is total: a skipped question yields the right number
 * of empty strings, so the table stays rectangular no matter what is missing.
 *
 * Column ids are built from the question `key`, never its `id` — the id changes
 * when a survey is duplicated, and two waves of the same survey have to line up
 * column for column. Cells carry labels rather than stored values so the file
 * reads like the survey did.
 *
 * Statements produce no columns and are not accepted here; walk a survey with
 * `elements.filter(isAnswerableElement)`.
 */

export type CsvColumn = {
    /** Stable across waves: `key`, or `key__<option|row>` for a fanned-out one. */
    readonly id: string;
    readonly header: string;
    readonly questionKey: string;
    readonly questionId: QuestionId;
};

/** Suffix for the free-text column that accompanies an "other" option. */
const OTHER_COLUMN_SUFFIX = "other";

export function toCsvColumns(
    question: AnswerableQuestion
): readonly CsvColumn[] {
    const column = (suffix: string | null, header: string): CsvColumn => ({
        id: suffix === null ? question.key : `${question.key}__${suffix}`,
        header,
        questionKey: question.key,
        questionId: question.id
    });

    // Only choice questions have an `otherLabel`, so the label is passed in from
    // the narrowed case rather than read off the union.
    const otherColumn = (otherLabel: string | undefined) =>
        column(
            OTHER_COLUMN_SUFFIX,
            qualify(question.title, otherLabel ?? OTHER_COLUMN_SUFFIX)
        );

    switch (question.type) {
        case "single_choice":
            return question.allowOther
                ? [
                      column(null, question.title),
                      otherColumn(question.otherLabel)
                  ]
                : [column(null, question.title)];

        case "multi_choice": {
            // One column per option, so a respondent's selections are readable as a
            // row of flags rather than a packed list.
            const columns = question.options.map(option =>
                column(option.value, qualify(question.title, option.label))
            );
            return question.allowOther
                ? [...columns, otherColumn(question.otherLabel)]
                : columns;
        }

        case "dropdown":
        case "short_text":
        case "long_text":
        case "opinion_scale":
        case "nps":
            return [column(null, question.title)];

        case "matrix_single":
            // One column per row; the cell holds the chosen column's label.
            return question.rows.map(row =>
                column(row.value, qualify(question.title, row.label))
            );

        default:
            return assertNever(question, "question type");
    }
}

export function toCsvCells(
    question: AnswerableQuestion,
    answer: AnswerValue | null
): readonly string[] {
    switch (question.type) {
        case "single_choice": {
            const given = isAnswerOfType(answer, "single_choice")
                ? answer
                : null;
            const chosenOther = given?.value === OTHER_OPTION_VALUE;
            const label =
                given === null
                    ? ""
                    : chosenOther
                      ? (question.otherLabel ?? "")
                      : labelOf(question.options, given.value);
            return question.allowOther
                ? [label, (chosenOther && given?.other) || ""]
                : [label];
        }

        case "multi_choice": {
            const given = isAnswerOfType(answer, "multi_choice")
                ? answer
                : null;
            const selected = new Set(given?.values ?? []);
            const cells = question.options.map(option =>
                selected.has(option.value) ? "1" : ""
            );
            if (!question.allowOther) return cells;
            const other = selected.has(OTHER_OPTION_VALUE)
                ? (given?.other ?? "")
                : "";
            return [...cells, other];
        }

        case "dropdown": {
            const given = isAnswerOfType(answer, "dropdown") ? answer : null;
            return [
                given === null ? "" : labelOf(question.options, given.value)
            ];
        }

        case "short_text": {
            const given = isAnswerOfType(answer, "short_text") ? answer : null;
            return [given?.value ?? ""];
        }

        case "long_text": {
            const given = isAnswerOfType(answer, "long_text") ? answer : null;
            return [given?.value ?? ""];
        }

        case "opinion_scale": {
            const given = isAnswerOfType(answer, "opinion_scale")
                ? answer
                : null;
            return [given === null ? "" : String(given.value)];
        }

        case "nps": {
            const given = isAnswerOfType(answer, "nps") ? answer : null;
            return [given === null ? "" : String(given.value)];
        }

        case "matrix_single": {
            const given = isAnswerOfType(answer, "matrix_single")
                ? answer
                : null;
            return question.rows.map(row => {
                const chosen = given?.values[row.value];
                return chosen === undefined
                    ? ""
                    : labelOf(question.columns, chosen);
            });
        }

        default:
            return assertNever(question, "question type");
    }
}

/**
 * The same columns, with any header that is not unique qualified by the column
 * id until it is.
 *
 * Two questions are allowed to carry the same title — an author writing a
 * grid of "Kui rahul oled?" per department is doing nothing wrong, and the
 * builder keeps their *keys* apart (`uus_kusimus`, `uus_kusimus_2`). The file
 * only carries headers, though, so without this a spreadsheet gets two columns
 * with one name and no way to tell which question either belongs to.
 *
 * Only the colliding headers are touched: a file whose questions have distinct
 * titles reads exactly as it did. The column `id` is what gets appended
 * because it is the identity the rest of the pipeline already uses — the same
 * string a wave comparison joins on — and a trailing counter guarantees
 * termination even if two columns somehow shared one id.
 */
export function withUniqueHeaders(
    columns: readonly CsvColumn[]
): readonly CsvColumn[] {
    const seen = new Map<string, number>();
    for (const column of columns) {
        seen.set(column.header, (seen.get(column.header) ?? 0) + 1);
    }

    const used = new Set<string>();
    return columns.map(column => {
        if (seen.get(column.header) === 1) {
            used.add(column.header);
            return column;
        }
        let header = qualify(column.header, column.id);
        for (let n = 2; used.has(header); n += 1) {
            header = qualify(column.header, `${column.id} ${n}`);
        }
        used.add(header);
        return { ...column, header };
    });
}

/** `"Rate the team [Speed]"` — the header for one fanned-out column. */
function qualify(title: string, part: string): string {
    return `${title} [${part}]`;
}

/**
 * Falls back to the stored value when an option has since been deleted, so an
 * old response exports as something rather than as a blank.
 */
function labelOf(
    options: readonly { readonly value: string; readonly label: string }[],
    value: string
): string {
    return options.find(option => option.value === value)?.label ?? value;
}
