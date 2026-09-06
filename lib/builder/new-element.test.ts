import { describe, expect, it } from "vitest";

import {
    ELEMENT_TYPES,
    OTHER_OPTION_VALUE,
    SurveyElementSchema,
    type SurveyElement
} from "@/domain/question";
import {
    CREATABLE_ELEMENT_TYPES,
    createElement,
    duplicateElement,
    isCreatableType,
    newOption,
    nextOptionValue,
    takenKeys
} from "@/lib/builder/new-element";

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

describe("createElement", () => {
    it("produces a single_choice question the domain accepts", () => {
        const element = createElement("single_choice", defaults, []);

        expect(SurveyElementSchema.safeParse(element).success).toBe(true);
        expect(element.type).toBe("single_choice");
        expect(element.title).toBe("Uus küsimus");
    });

    it("starts with the two options the schema requires", () => {
        const element = createElement("single_choice", defaults, []);
        if (element.type !== "single_choice") throw new Error("wrong type");

        expect(element.options).toEqual([
            { value: "option_1", label: "Valik 1" },
            { value: "option_2", label: "Valik 2" }
        ]);
    });

    it("gives every element a fresh id", () => {
        const first = createElement("single_choice", defaults, []);
        const second = createElement("single_choice", defaults, [first]);

        expect(second.id).not.toBe(first.id);
    });

    it("derives a key that does not collide with its siblings", () => {
        const first = createElement("single_choice", defaults, []);
        const second = createElement("single_choice", defaults, [first]);
        const third = createElement("single_choice", defaults, [first, second]);

        expect(first.key).toBe("uus_kusimus");
        expect(second.key).toBe("uus_kusimus_2");
        expect(third.key).toBe("uus_kusimus_3");
    });
});

describe("CREATABLE_ELEMENT_TYPES", () => {
    it("is the set the add menu enables", () => {
        expect(isCreatableType("single_choice")).toBe(true);
        expect(isCreatableType("matrix_single")).toBe(true);
        expect(isCreatableType("statement")).toBe(true);
    });

    it("covers the whole union, so nothing is offered without an editor", () => {
        // Not an alias of ELEMENT_TYPES: a tenth type has to be taught to
        // `createElement` before the menu offers it, and the assertNever there
        // is what makes that a build error rather than a runtime one.
        expect([...CREATABLE_ELEMENT_TYPES].sort()).toEqual(
            [...ELEMENT_TYPES].sort()
        );
    });

    it("has no duplicates", () => {
        expect(new Set(CREATABLE_ELEMENT_TYPES).size).toBe(
            CREATABLE_ELEMENT_TYPES.length
        );
    });
});

describe.each(ELEMENT_TYPES)("a new %s", type => {
    it("is a document the domain accepts", () => {
        const parsed = SurveyElementSchema.safeParse(
            createElement(type, defaults, [])
        );
        expect(parsed.error?.issues ?? []).toEqual([]);
    });

    it("is answerable unless it is a statement", () => {
        const element = createElement(type, defaults, []);
        expect(element.isAnswerable).toBe(type !== "statement");
    });

    it("can be duplicated into a document the domain accepts", () => {
        const source = createElement(type, defaults, []);
        const copy = duplicateElement(source, [source]);

        expect(SurveyElementSchema.safeParse(copy).success).toBe(true);
        expect(copy.type).toBe(type);
    });
});

describe("duplicateElement", () => {
    it("keeps everything the author wrote", () => {
        const source = createElement("multi_choice", defaults, []);
        if (source.type !== "multi_choice") throw new Error("wrong type");
        const edited = {
            ...source,
            title: "Millised kanalid?",
            options: [
                { value: "option_1", label: "E-post" },
                { value: "option_2", label: "Telefon" }
            ],
            minSelections: 1
        };

        const copy = duplicateElement(edited, [edited]);

        expect(copy).toMatchObject({
            type: "multi_choice",
            title: "Millised kanalid?",
            options: edited.options,
            minSelections: 1
        });
    });

    it("takes a fresh id and a fresh key, unlike duplicating a survey", () => {
        // Two questions in one survey may not share a key: SurveySchema
        // rejects it, and the CSV would grow two columns with one header.
        // Preserving keys is a *cross-survey* rule (docs/DECISIONS.md 003).
        const source = createElement("single_choice", defaults, []);
        const copy = duplicateElement(source, [source]);

        expect(copy.id).not.toBe(source.id);
        expect(copy.key).not.toBe(source.key);
        expect(copy.key).toBe(`${source.key}_2`);
    });
});

describe("nextOptionValue", () => {
    it("fills the first free slot rather than counting entries", () => {
        // Deleting the middle option must not hand the next one a value that
        // an existing answer already points at.
        expect(nextOptionValue(["option_1", "option_3"])).toBe("option_2");
        expect(nextOptionValue([])).toBe("option_1");
    });

    it("never produces the reserved other value", () => {
        const values = Array.from({ length: 20 }, (_, index) =>
            nextOptionValue(
                Array.from({ length: index }, (_, n) => `option_${n + 1}`)
            )
        );
        expect(values).not.toContain(OTHER_OPTION_VALUE);
    });
});

describe("newOption", () => {
    it("numbers the label from the current option count", () => {
        expect(
            newOption(
                [{ value: "option_1", label: "Valik 1" }],
                defaults.optionLabel
            )
        ).toEqual({ value: "option_2", label: "Valik 2" });
    });
});

describe("takenKeys", () => {
    const elements: readonly SurveyElement[] = [
        createElement("single_choice", { ...defaults, title: "Esimene" }, []),
        createElement("single_choice", { ...defaults, title: "Teine" }, [])
    ];

    it("lists every key", () => {
        expect(takenKeys(elements)).toEqual(["esimene", "teine"]);
    });

    it("excludes the element being edited, so it can keep its own key", () => {
        expect(takenKeys(elements, elements[1])).toEqual(["esimene"]);
    });
});
