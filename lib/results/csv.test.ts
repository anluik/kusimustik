import { describe, expect, it } from "vitest";

import { responseId } from "@/domain/ids";
import { OTHER_OPTION_VALUE } from "@/domain/question";
import {
    ALL_ELEMENTS,
    Q,
    SURVEY_ID,
    multiChoice,
    shortText,
    singleChoice,
    statement
} from "@/domain/test-fixtures";
import type { ResponseRecord } from "@/lib/db/responses";
import {
    CSV_DELIMITER,
    buildCsvFile,
    buildCsvTable,
    csvFileName,
    serialiseCsv
} from "@/lib/results/csv";

const LABELS = {
    responseId: "Vastuse id",
    submittedAt: "Esitatud",
    locale: "Keel",
    surveyVersion: "Versioon"
} as const;

function response(
    overrides: Partial<ResponseRecord> & Pick<ResponseRecord, "answers">
): ResponseRecord {
    return {
        id: responseId("44444444-4444-4444-8444-444444444444"),
        surveyId: SURVEY_ID,
        surveyVersion: 3,
        locale: "et",
        submittedAt: "2026-01-12T09:30:00+00:00",
        ...overrides
    };
}

describe("buildCsvTable", () => {
    it("puts the response metadata first, in catalogue order", () => {
        const [header] = buildCsvTable([], [], LABELS);
        expect(header).toEqual(["Vastuse id", "Esitatud", "Keel", "Versioon"]);
    });

    it("gives a statement no columns", () => {
        const [header] = buildCsvTable([statement], [], LABELS);
        expect(header).toHaveLength(4);
    });

    it("fans a multi-choice out to one column per option plus its other", () => {
        const [header] = buildCsvTable([multiChoice], [], LABELS);
        expect(header?.slice(4)).toEqual(
            multiChoice.options.map(
                option => `${multiChoice.title} [${option.label}]`
            )
        );
    });

    it("stays rectangular when every question is skipped", () => {
        const table = buildCsvTable(
            ALL_ELEMENTS,
            [response({ answers: {} })],
            LABELS
        );
        const [header, row] = table;
        expect(row).toHaveLength(header?.length ?? 0);
        // Metadata is still there; every answer cell is empty.
        expect(row?.slice(4).every(cell => cell === "")).toBe(true);
    });

    it("writes the labels a respondent saw, not the stored values", () => {
        const table = buildCsvTable(
            [singleChoice],
            [
                response({
                    answers: {
                        [Q.role]: { type: "single_choice", value: "dev" }
                    }
                })
            ],
            LABELS
        );
        expect(table[1]?.slice(4)).toEqual(["Developer", ""]);
    });

    it("carries an 'other' answer's text in its own column", () => {
        const table = buildCsvTable(
            [singleChoice],
            [
                response({
                    answers: {
                        [Q.role]: {
                            type: "single_choice",
                            value: OTHER_OPTION_VALUE,
                            other: "Founder"
                        }
                    }
                })
            ],
            LABELS
        );
        expect(table[1]?.slice(4)).toEqual(["Other", "Founder"]);
    });

    it("keeps a response with no answers as a row: the row is the denominator", () => {
        const table = buildCsvTable(
            ALL_ELEMENTS,
            [response({ answers: {} }), response({ answers: {} })],
            LABELS
        );
        expect(table).toHaveLength(3);
    });

    it("renders a missing locale as empty rather than as 'null'", () => {
        const table = buildCsvTable(
            [],
            [response({ answers: {}, locale: null })],
            LABELS
        );
        expect(table[1]?.[2]).toBe("");
    });
    it("keeps the columns of two same-titled questions apart", () => {
        // The builder allows two questions to carry one title and keeps their
        // keys distinct; the file carries only headers, so it has to say which
        // is which.
        const twin = { ...shortText, id: Q.city, key: "city_2" };
        const [header] = buildCsvTable([shortText, twin], [], LABELS);
        const columns = header?.slice(4) ?? [];

        expect(new Set(columns).size).toBe(columns.length);
        expect(columns).toEqual([
            `${shortText.title} [${shortText.key}]`,
            `${shortText.title} [city_2]`
        ]);
    });

    it("stays rectangular when headers are disambiguated", () => {
        const twin = { ...shortText, id: Q.city, key: "city_2" };
        const table = buildCsvTable(
            [shortText, twin],
            [response({ answers: {} })],
            LABELS
        );

        for (const row of table)
            expect(row).toHaveLength(table[0]?.length ?? 0);
    });
});

describe("serialiseCsv", () => {
    it("starts with a UTF-8 BOM and separates rows with CRLF", () => {
        const text = serialiseCsv([["a"], ["b"]]);
        expect(text).toBe("﻿a\r\nb\r\n");
    });

    it("joins cells with a semicolon", () => {
        expect(serialiseCsv([["a", "b"]])).toContain(`a${CSV_DELIMITER}b`);
    });

    it("quotes a cell containing the delimiter, a quote or a newline", () => {
        expect(serialiseCsv([["a;b", 'say "hi"', "one\ntwo"]])).toBe(
            '﻿"a;b";"say ""hi""";"one\ntwo"\r\n'
        );
    });

    it("quotes a cell with surrounding whitespace so it survives a round trip", () => {
        expect(serialiseCsv([[" padded "]])).toBe('﻿" padded "\r\n');
    });

    it("neutralises a cell a spreadsheet would execute", () => {
        // The respondent typed it into a free-text question; Excel and Sheets
        // both run this on open.
        expect(serialiseCsv([["=cmd|'/c calc'!A0"]])).toBe(
            "﻿'=cmd|'/c calc'!A0\r\n"
        );
        expect(serialiseCsv([["@SUM(A1:A9)"]])).toBe("﻿'@SUM(A1:A9)\r\n");
    });

    it("leaves a number alone, sign and all", () => {
        expect(serialiseCsv([["-5"], ["+372 5555 5555"], ["1,5"]])).toBe(
            "﻿-5\r\n+372 5555 5555\r\n1,5\r\n"
        );
    });
});

describe("buildCsvFile", () => {
    it("writes a free-text answer that contains the delimiter as one cell", () => {
        const text = buildCsvFile(
            [shortText],
            [
                response({
                    answers: {
                        [Q.city]: {
                            type: "short_text",
                            value: "Tartu; Tallinn"
                        }
                    }
                })
            ],
            LABELS
        );
        const lastLine = text.trimEnd().split("\r\n")[1];
        expect(lastLine?.endsWith('"Tartu; Tallinn"')).toBe(true);
    });
});

describe("csvFileName", () => {
    it("is the slugified title and the day", () => {
        expect(
            csvFileName(
                "Teenuse rahulolu-uuring",
                new Date("2026-01-12T22:00:00Z")
            )
        ).toBe("teenuse-rahulolu-uuring-2026-01-12.csv");
    });

    it("falls back when a title slugifies to nothing", () => {
        expect(csvFileName("!!!", new Date("2026-01-12T22:00:00Z"))).toBe(
            "survey-2026-01-12.csv"
        );
    });
});
