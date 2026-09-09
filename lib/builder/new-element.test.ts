import { describe, expect, it } from "vitest";

import { authorElement } from "@/domain/localize";
import {
    AuthoredElementSchema,
    ELEMENT_TYPES,
    OTHER_OPTION_VALUE,
    SurveyElementSchema
} from "@/domain/question";
import {
    CREATABLE_ELEMENT_TYPES,
    createElement,
    duplicateElement,
    isCreatableType,
    newOption,
    nextOptionValue
} from "@/lib/builder/new-element";
import type { SurveyKeys } from "@/lib/builder/keys";

/** No wave, nothing published, nothing removed: the plain case. */
const KEYS: SurveyKeys = { policy: "derive", reserved: [] };

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

describe("createElement", () => {
    it("produces a single_choice question the domain accepts", () => {
        const element = createElement("single_choice", defaults, [], KEYS);

        expect(SurveyElementSchema.safeParse(element).success).toBe(true);
        expect(element.type).toBe("single_choice");
        expect(element.title).toBe("Uus küsimus");
    });

    it("starts with the two options the schema requires", () => {
        const element = createElement("single_choice", defaults, [], KEYS);
        if (element.type !== "single_choice") throw new Error("wrong type");

        expect(element.options).toEqual([
            { value: "option_1", label: "Valik 1" },
            { value: "option_2", label: "Valik 2" }
        ]);
    });

    it("starts a written-answer question optional and everything else required", () => {
        // A required open-ended question is where a phone respondent leaves,
        // so the two text types default the other way round from the rest.
        const requiredness = (
            [
                "single_choice",
                "multi_choice",
                "dropdown",
                "short_text",
                "long_text",
                "opinion_scale",
                "nps",
                "matrix_single"
            ] as const
        ).map(type => {
            const element = createElement(type, defaults, [], KEYS);
            return [type, element.isAnswerable && element.required] as const;
        });

        expect(Object.fromEntries(requiredness)).toEqual({
            single_choice: true,
            multi_choice: true,
            dropdown: true,
            short_text: false,
            long_text: false,
            opinion_scale: true,
            nps: true,
            matrix_single: true
        });
    });

    it("gives every element a fresh id", () => {
        const first = createElement("single_choice", defaults, [], KEYS);
        const second = createElement("single_choice", defaults, [first], KEYS);

        expect(second.id).not.toBe(first.id);
    });

    it("derives a key that does not collide with its siblings", () => {
        const first = createElement("single_choice", defaults, [], KEYS);
        const second = createElement("single_choice", defaults, [first], KEYS);
        const third = createElement(
            "single_choice",
            defaults,
            [first, second],
            KEYS
        );

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
            createElement(type, defaults, [], KEYS)
        );
        expect(parsed.error?.issues ?? []).toEqual([]);
    });

    it("is answerable unless it is a statement", () => {
        const element = createElement(type, defaults, [], KEYS);
        expect(element.isAnswerable).toBe(type !== "statement");
    });

    it("can be duplicated into a document the domain accepts", () => {
        const source = authorElement(
            createElement(type, defaults, [], KEYS),
            "et"
        );
        const copy = duplicateElement(source, "et", [source], KEYS);

        expect(AuthoredElementSchema.safeParse(copy).success).toBe(true);
        expect(copy.type).toBe(type);
    });
});

describe("duplicateElement", () => {
    it("keeps everything the author wrote", () => {
        const source = createElement("multi_choice", defaults, [], KEYS);
        if (source.type !== "multi_choice") throw new Error("wrong type");
        const edited = authorElement(
            {
                ...source,
                title: "Millised kanalid?",
                options: [
                    { value: "option_1", label: "E-post" },
                    { value: "option_2", label: "Telefon" }
                ],
                minSelections: 1
            },
            "et"
        );

        const copy = duplicateElement(edited, "et", [edited], KEYS);

        expect(copy).toMatchObject({
            type: "multi_choice",
            title: { et: "Millised kanalid?" },
            minSelections: 1
        });
    });

    it("carries every translation, not just the one on screen", () => {
        // The copy is made from the stored element, so a question written in
        // three languages is duplicated in three. Copying one language of it
        // would lose two translations to a click.
        const source = createElement("single_choice", defaults, [], KEYS);
        const translated = {
            ...authorElement(source, "et"),
            title: { et: "Roll", en: "Role", ru: "Роль" }
        };

        const copy = duplicateElement(translated, "et", [translated], KEYS);

        expect(copy.title).toEqual({ et: "Roll", en: "Role", ru: "Роль" });
    });

    it("derives the key from the survey's own language", () => {
        // Not from whichever language is on screen: the key names a CSV
        // column and joins this wave to the next one.
        const source = createElement("nps", defaults, [], KEYS);
        const translated = {
            ...authorElement(source, "et"),
            title: { et: "Soovitus", ru: "Рекомендация" }
        };

        expect(duplicateElement(translated, "et", [], KEYS).key).toBe(
            "soovitus"
        );
    });

    it("takes a fresh id and a fresh key, unlike duplicating a survey", () => {
        // Two questions in one survey may not share a key: SurveySchema
        // rejects it, and the CSV would grow two columns with one header.
        // Preserving keys is a *cross-survey* rule (docs/DECISIONS.md 003).
        const source = authorElement(
            createElement("single_choice", defaults, [], KEYS),
            "et"
        );
        const copy = duplicateElement(source, "et", [source], KEYS);

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
