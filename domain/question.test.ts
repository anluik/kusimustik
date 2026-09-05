import { describe, expect, it } from "vitest";

import {
    ANSWERABLE_QUESTION_TYPES,
    ELEMENT_TYPES,
    OPINION_SCALE_MAX_STEPS,
    OTHER_OPTION_VALUE,
    SurveyElementSchema,
    deriveQuestionKey,
    isAnswerableElement
} from "@/domain/question";
import {
    ALL_ELEMENTS,
    Q,
    multiChoice,
    opinionScale,
    singleChoice,
    statement
} from "@/domain/test-fixtures";

describe("the element union", () => {
    it("covers the eight MVP question types plus the statement block", () => {
        expect(ELEMENT_TYPES).toHaveLength(9);
        expect(ANSWERABLE_QUESTION_TYPES).toHaveLength(8);
        expect(ELEMENT_TYPES).toContain("statement");
        expect(ANSWERABLE_QUESTION_TYPES).not.toContain("statement");
    });

    it("parses every fixture element", () => {
        for (const element of ALL_ELEMENTS) {
            expect(SurveyElementSchema.parse(element)).toEqual(element);
        }
    });

    it("defaults isAnswerable from the type, so stored JSON need not carry it", () => {
        const parsed = SurveyElementSchema.parse({
            type: "short_text",
            id: Q.city,
            key: "city",
            title: "Which city?",
            required: false
        });
        expect(parsed.isAnswerable).toBe(true);

        const parsedStatement = SurveyElementSchema.parse({
            type: "statement",
            id: Q.intro,
            key: "intro",
            title: "Thanks"
        });
        expect(parsedStatement.isAnswerable).toBe(false);
    });

    it("refuses an element that lies about being answerable", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                isAnswerable: false
            }).success
        ).toBe(false);
        expect(
            SurveyElementSchema.safeParse({ ...statement, isAnswerable: true })
                .success
        ).toBe(false);
    });

    it("narrows statements out with isAnswerableElement", () => {
        const answerable = ALL_ELEMENTS.filter(isAnswerableElement);
        expect(answerable).toHaveLength(8);
        expect(answerable.map(q => q.key)).not.toContain("intro");
    });
});

describe("element validation rules", () => {
    it("requires a slug-shaped key", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                key: "Not A Slug"
            }).success
        ).toBe(false);
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                key: "2nd_question"
            }).success
        ).toBe(false);
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                key: "nps_overall"
            }).success
        ).toBe(true);
    });

    it("requires at least two options on a choice question", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                options: [{ value: "a", label: "A" }]
            }).success
        ).toBe(false);
    });

    it("rejects duplicate option values", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                options: [
                    { value: "dev", label: "Developer" },
                    { value: "dev", label: "Developer again" }
                ]
            }).success
        ).toBe(false);
    });

    it("reserves the 'other' sentinel so it can never collide with a real option", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...singleChoice,
                options: [
                    { value: OTHER_OPTION_VALUE, label: "Other" },
                    { value: "dev", label: "Developer" }
                ]
            }).success
        ).toBe(false);
    });

    it("rejects a multi_choice whose min exceeds its max", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...multiChoice,
                minSelections: 3,
                maxSelections: 2
            }).success
        ).toBe(false);
    });

    it("rejects a multi_choice asking for more selections than it has options", () => {
        expect(
            SurveyElementSchema.safeParse({ ...multiChoice, maxSelections: 9 })
                .success
        ).toBe(false);
    });

    it("caps the opinion scale at fifteen steps", () => {
        expect(
            SurveyElementSchema.safeParse({
                ...opinionScale,
                max: OPINION_SCALE_MAX_STEPS
            }).success
        ).toBe(true);
        expect(
            SurveyElementSchema.safeParse({
                ...opinionScale,
                max: OPINION_SCALE_MAX_STEPS + 1
            }).success
        ).toBe(false);
        expect(
            SurveyElementSchema.safeParse({ ...opinionScale, max: 1 }).success
        ).toBe(false);
    });

    it("rejects a matrix with duplicate row values or a single column", () => {
        const base = ALL_ELEMENTS.find(e => e.type === "matrix_single");
        expect(base).toBeDefined();
        if (base?.type !== "matrix_single") return;
        expect(
            SurveyElementSchema.safeParse({
                ...base,
                rows: [
                    { value: "speed", label: "Speed" },
                    { value: "speed", label: "Speed again" }
                ]
            }).success
        ).toBe(false);
        expect(
            SurveyElementSchema.safeParse({
                ...base,
                columns: [{ value: "low", label: "Low" }]
            }).success
        ).toBe(false);
    });
});

describe("deriveQuestionKey", () => {
    it("slugifies a title", () => {
        expect(deriveQuestionKey("How satisfied are you?")).toBe(
            "how_satisfied_are_you"
        );
    });

    it("folds Estonian diacritics rather than dropping the words", () => {
        expect(deriveQuestionKey("Küsimus üldise õhkkonna kohta")).toBe(
            "kusimus_uldise_ohkkonna_kohta"
        );
        expect(deriveQuestionKey("Šokolaad ja žanr")).toBe("sokolaad_ja_zanr");
    });

    it("keeps the key a valid identifier when the title starts with a digit", () => {
        expect(deriveQuestionKey("2025 outlook")).toBe("q_2025_outlook");
    });

    it("falls back when a title slugifies to nothing", () => {
        expect(deriveQuestionKey("🎉 !!! ")).toBe("question");
    });

    it("suffixes to avoid collisions with keys already in the survey", () => {
        expect(deriveQuestionKey("Rating", ["rating"])).toBe("rating_2");
        expect(deriveQuestionKey("Rating", ["rating", "rating_2"])).toBe(
            "rating_3"
        );
    });

    it("always produces something the schema accepts", () => {
        for (const title of ["🎉", "2025", "Küsimus", "a".repeat(200)]) {
            const key = deriveQuestionKey(title);
            expect(
                SurveyElementSchema.safeParse({ ...singleChoice, key }).success
            ).toBe(true);
        }
    });
});
