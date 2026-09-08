import { toCsvCells, toCsvColumns, withUniqueHeaders } from "@/domain/export";
import { slugifyTitle } from "@/domain/slug";
import type { SurveyElement } from "@/domain/question";
import type { ResponseRecord } from "@/lib/db/responses";
import { tableQuestions } from "@/lib/results/response-table";

/**
 * The CSV export: `toCsvColumns` / `toCsvCells` from Phase 1 assembled into a
 * file (docs/PLAN.md Phase 8).
 *
 * The domain decides *what* a question contributes and what one answer reads
 * as; everything here is the file format around that — the delimiter, the
 * quoting, the response metadata that is not an answer to anything, and the
 * name the browser saves it under. Split that way because the first half is
 * the same question the results table answers differently (DECISIONS 018) and
 * the second half is a spreadsheet's problem, not a survey's.
 *
 * Four conventions, all of them about the file opening correctly rather than
 * about taste — see docs/DECISIONS.md 019:
 *
 * - **Semicolon delimited**, because the market is Estonian and Excel splits
 *   on the system list separator, which is `;` on an Estonian Windows.
 * - **A UTF-8 BOM**, without which the same Excel reads `õ` as two bytes of
 *   mojibake.
 * - **CRLF line endings**, per RFC 4180.
 * - **Leading `=`, `+`, `-` and `@` in a non-numeric cell are neutralised**,
 *   because a respondent types free text and a spreadsheet executes it.
 */

export const CSV_DELIMITER = ";";
const ROW_SEPARATOR = "\r\n";

/** Excel needs it to read the file as UTF-8; every other reader tolerates it. */
const BOM = "\uFEFF";

/** Response metadata columns, in order. Headers come from the catalogue. */
export const CSV_META_COLUMNS = [
    "responseId",
    "submittedAt",
    "locale",
    "surveyVersion"
] as const;

export type CsvMetaColumn = (typeof CSV_META_COLUMNS)[number];
export type CsvMetaLabels = Readonly<Record<CsvMetaColumn, string>>;

/**
 * The whole file as a table: one header row, then one row per response.
 *
 * Driven from `elements`, so a question nobody answered is still a column of
 * empties — the same reason the results cards are. Rectangular by
 * construction: `toCsvCells` returns exactly as many cells as `toCsvColumns`
 * returns columns, for every question, answered or not.
 */
export function buildCsvTable(
    elements: readonly SurveyElement[],
    responses: readonly ResponseRecord[],
    labels: CsvMetaLabels
): readonly (readonly string[])[] {
    const questions = tableQuestions(elements);

    // Headers are the author's titles, and two questions may share one; the
    // cells below stay aligned because `withUniqueHeaders` renames columns
    // without reordering or dropping any.
    const columns = withUniqueHeaders(
        questions.flatMap(question => toCsvColumns(question))
    );

    const header = [
        ...CSV_META_COLUMNS.map(column => labels[column]),
        ...columns.map(column => column.header)
    ];

    const rows = responses.map(response => [
        response.id,
        // ISO 8601, not `12. jaan 2026`: a spreadsheet has to be able to sort
        // and parse this, and the display formatting is the screen's job.
        response.submittedAt,
        response.locale ?? "",
        String(response.surveyVersion),
        ...questions.flatMap(question =>
            toCsvCells(question, response.answers[question.id] ?? null)
        )
    ]);

    return [header, ...rows];
}

/** RFC 4180 with a semicolon, a BOM, and formula-injection neutralised. */
export function serialiseCsv(table: readonly (readonly string[])[]): string {
    return (
        BOM +
        table
            .map(row => row.map(escapeCell).join(CSV_DELIMITER))
            .join(ROW_SEPARATOR) +
        ROW_SEPARATOR
    );
}

export function buildCsvFile(
    elements: readonly SurveyElement[],
    responses: readonly ResponseRecord[],
    labels: CsvMetaLabels
): string {
    return serialiseCsv(buildCsvTable(elements, responses, labels));
}

/**
 * `rahulolu-uuring-2026-01-12.csv`. The survey's own title, slugified by the
 * same function that makes its public link, so a downloaded file is
 * recognisable as the survey it came from and contains nothing that needs
 * escaping in a `Content-Disposition` header.
 */
export function csvFileName(title: string, at: Date): string {
    const base = slugifyTitle(title);
    const day = at.toISOString().slice(0, 10);
    return `${base === "" ? "survey" : base}-${day}.csv`;
}

/** Quoted only where it has to be, so a hand-read file stays readable. */
function escapeCell(value: string): string {
    const safe = neutraliseFormula(value);
    const mustQuote =
        safe.includes(CSV_DELIMITER) ||
        safe.includes('"') ||
        safe.includes("\n") ||
        safe.includes("\r") ||
        safe !== safe.trim();

    return mustQuote ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** `=`, `+`, `-`, `@` and the two control characters Excel also treats as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * `-5`, `1,5`, `+372 5555 5555` — a sign followed by nothing but digits and
 * separators cannot be a formula, and these are the cells a blanket rule would
 * mangle most often.
 */
const PLAIN_NUMBER = /^[+-]?[\d.,\u00a0 ]+$/;

/**
 * A cell beginning `=cmd|'/c calc'!A0` is executed by Excel and Google Sheets
 * when the file is opened, and respondents type free text. Prefixing with an
 * apostrophe is the standard neutralisation: the spreadsheet reads the rest as
 * literal text.
 *
 * Numbers are exempt, so `-5` from an opinion scale and `+372 5555 5555` from
 * a phone-number answer survive intact — they are the common case, and
 * mangling every one of them to defend against the rare one would be a worse
 * trade than it looks.
 */
function neutraliseFormula(value: string): string {
    if (!FORMULA_START.test(value) || PLAIN_NUMBER.test(value)) return value;
    return `'${value}`;
}
