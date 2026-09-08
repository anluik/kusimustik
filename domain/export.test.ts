import { describe, expect, it } from "vitest";

import { toCsvCells, toCsvColumns, withUniqueHeaders } from "@/domain/export";
import {
    ALL_QUESTIONS,
    RESPONSES,
    answersFor,
    dropdown,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    singleChoice
} from "@/domain/test-fixtures";

describe("toCsvColumns", () => {
    it("gives every column an id built from the question key, never its id", () => {
        for (const question of ALL_QUESTIONS) {
            for (const column of toCsvColumns(question)) {
                expect(column.id.startsWith(question.key)).toBe(true);
                expect(column.id).not.toContain(question.id);
                expect(column.questionKey).toBe(question.key);
            }
        }
    });

    it("fans a multi_choice out to one column per option", () => {
        expect(toCsvColumns(multiChoice).map(c => c.id)).toEqual([
            "channels__email",
            "channels__slack",
            "channels__phone",
            "channels__in_person"
        ]);
        expect(toCsvColumns(multiChoice).map(c => c.header)).toEqual([
            "Which channels do you use? [Email]",
            "Which channels do you use? [Slack]",
            "Which channels do you use? [Phone]",
            "Which channels do you use? [In person]"
        ]);
    });

    it("fans a matrix out to one column per row", () => {
        expect(toCsvColumns(matrixSingle).map(c => c.id)).toEqual([
            "team_ratings__speed",
            "team_ratings__quality"
        ]);
        expect(toCsvColumns(matrixSingle).map(c => c.header)).toEqual([
            "Rate the team [Speed]",
            "Rate the team [Quality]"
        ]);
    });

    it("adds a free-text column when a choice question allows 'other'", () => {
        expect(toCsvColumns(singleChoice).map(c => c.id)).toEqual([
            "role",
            "role__other"
        ]);
        expect(toCsvColumns(singleChoice)[1]?.header).toBe(
            "What is your role? [Other]"
        );
        expect(
            toCsvColumns({
                ...multiChoice,
                allowOther: true,
                otherLabel: "Muu"
            }).map(c => c.id)
        ).toEqual([
            "channels__email",
            "channels__slack",
            "channels__phone",
            "channels__in_person",
            "channels__other"
        ]);
    });

    it("gives the single-value question types exactly one column", () => {
        for (const question of [dropdown, shortText, opinionScale, nps]) {
            const columns = toCsvColumns(question);
            expect(columns).toHaveLength(1);
            expect(columns[0]?.id).toBe(question.key);
            expect(columns[0]?.header).toBe(question.title);
        }
    });
});

describe("toCsvCells", () => {
    it("always returns exactly as many cells as the question has columns", () => {
        for (const question of ALL_QUESTIONS) {
            const width = toCsvColumns(question).length;
            for (const answer of answersFor(question)) {
                expect(toCsvCells(question, answer)).toHaveLength(width);
            }
            expect(toCsvCells(question, null)).toHaveLength(width);
        }
    });

    it("blanks every cell for a skipped question", () => {
        for (const question of ALL_QUESTIONS) {
            expect(toCsvCells(question, null).every(cell => cell === "")).toBe(
                true
            );
        }
    });

    it("writes labels rather than stored values, so the file reads like the survey", () => {
        expect(
            toCsvCells(singleChoice, { type: "single_choice", value: "dev" })
        ).toEqual(["Developer", ""]);
        expect(toCsvCells(dropdown, { type: "dropdown", value: "ee" })).toEqual(
            ["Estonia"]
        );
        expect(
            toCsvCells(matrixSingle, {
                type: "matrix_single",
                values: { speed: "high", quality: "low" }
            })
        ).toEqual(["High", "Low"]);
    });

    it("marks each selected multi_choice option in its own column", () => {
        expect(
            toCsvCells(multiChoice, {
                type: "multi_choice",
                values: ["email", "in_person"]
            })
        ).toEqual(["1", "", "", "1"]);
    });

    it("puts 'other' free text in the free-text column", () => {
        expect(
            toCsvCells(singleChoice, {
                type: "single_choice",
                value: "__other__",
                other: "Student"
            })
        ).toEqual(["Other", "Student"]);

        const withOther = {
            ...multiChoice,
            allowOther: true,
            otherLabel: "Muu"
        } as const;
        expect(
            toCsvCells(withOther, {
                type: "multi_choice",
                values: ["email", "__other__"],
                other: "Carrier pigeon"
            })
        ).toEqual(["1", "", "", "", "Carrier pigeon"]);
    });

    it("writes numbers as plain digits", () => {
        expect(
            toCsvCells(opinionScale, { type: "opinion_scale", value: 4 })
        ).toEqual(["4"]);
        expect(toCsvCells(nps, { type: "nps", value: 0 })).toEqual(["0"]);
    });

    it("produces a rectangular table across the whole fixture", () => {
        const width = ALL_QUESTIONS.flatMap(toCsvColumns).length;
        for (const response of RESPONSES) {
            const row = ALL_QUESTIONS.flatMap(q =>
                toCsvCells(q, response.answers[q.key] ?? null)
            );
            expect(row).toHaveLength(width);
        }
    });
});

describe("withUniqueHeaders", () => {
    it("leaves distinct headers exactly as the author wrote them", () => {
        const columns = ALL_QUESTIONS.flatMap(toCsvColumns);
        expect(withUniqueHeaders(columns)).toEqual(columns);
    });

    it("qualifies both sides when two questions share a title", () => {
        // Same title, different keys — which is what the builder mints for a
        // second question added under the same name.
        const twin = { ...nps, key: "recommend_2" };
        const [first, second] = withUniqueHeaders([
            ...toCsvColumns(nps),
            ...toCsvColumns(twin)
        ]);

        expect(first?.header).toBe(`${nps.title} [recommend]`);
        expect(second?.header).toBe(`${nps.title} [recommend_2]`);
    });

    it("keeps one column per input column, in order", () => {
        const columns = [
            ...toCsvColumns(nps),
            ...toCsvColumns({ ...nps, key: "x" })
        ];
        const unique = withUniqueHeaders(columns);

        expect(unique).toHaveLength(columns.length);
        expect(unique.map(column => column.id)).toEqual(
            columns.map(column => column.id)
        );
    });

    it("still separates two columns that share an id as well as a header", () => {
        const [column] = toCsvColumns(nps);
        if (!column) throw new Error("no column");
        const headers = withUniqueHeaders([column, column]).map(c => c.header);

        expect(new Set(headers).size).toBe(2);
    });
});
