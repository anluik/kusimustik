import { describe, expect, it } from "vitest";

import {
    authorElement,
    authorElements,
    authorSurvey,
    elementTexts,
    mergeElement,
    mergeElements,
    missingTranslationCount,
    missingTranslations,
    projectElement,
    referenceTexts,
    resolveElement,
    resolveElements,
    resolveSurvey
} from "@/domain/localize";
import type { AuthoredChoiceOption, AuthoredElement } from "@/domain/question";
import { AuthoredElementSchema, SurveyElementSchema } from "@/domain/question";
import { AuthoredSurveySchema, SurveySchema } from "@/domain/survey";
import { LOCALES } from "@/domain/content";
import type { SurveyElement } from "@/domain/question";
import {
    ALL_ELEMENTS,
    Q,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    must,
    nps,
    opinionScale,
    shortText,
    singleChoice,
    statement,
    survey
} from "@/domain/test-fixtures";

const authored = authorElements(ALL_ELEMENTS, "et");
const authoredOf = (type: AuthoredElement["type"]): AuthoredElement =>
    must(
        authored.find(element => element.type === type),
        `no authored ${type}`
    );

describe("authorElement", () => {
    it("writes every string into the language given", () => {
        expect(authorElement(singleChoice, "ru")).toEqual({
            ...singleChoice,
            title: { ru: singleChoice.title },
            otherLabel: { ru: "Other" },
            options: [
                { value: "dev", label: { ru: "Developer" } },
                { value: "design", label: { ru: "Designer" } },
                { value: "pm", label: { ru: "Product manager" } }
            ]
        });
    });

    it("translates matrix rows and columns, not their values", () => {
        const element = authorElement(matrixSingle, "et");
        expect(element).toMatchObject({
            rows: [
                { value: "speed", label: { et: "Speed" } },
                { value: "quality", label: { et: "Quality" } }
            ]
        });
    });

    it("produces documents the authored schema accepts", () => {
        for (const element of authored) {
            expect(AuthoredElementSchema.safeParse(element).success).toBe(true);
        }
    });

    it("leaves an optional field the author never filled in absent", () => {
        const element = authorElement(opinionScale, "et");
        expect("description" in element).toBe(false);
    });

    it("treats an emptied optional field as absent rather than as blank text", () => {
        const element = authorElement({ ...opinionScale, minLabel: "" }, "et");
        expect("minLabel" in element).toBe(false);
        expect(AuthoredElementSchema.safeParse(element).success).toBe(true);
    });
});

describe("resolveElement", () => {
    it("is the inverse of authoring, for every element type", () => {
        expect(resolveElements(authored, "et")).toEqual([...ALL_ELEMENTS]);
    });

    it("produces documents the resolved schema accepts", () => {
        for (const element of resolveElements(authored, "et")) {
            expect(SurveyElementSchema.safeParse(element).success).toBe(true);
        }
    });

    it("returns the language asked for when the author has written it", () => {
        const element = {
            ...authoredOf("nps"),
            title: { et: "Kui tõenäoliselt?", en: "How likely?" }
        };
        expect(resolveElement(element, "en", "et").title).toBe("How likely?");
    });

    it("falls back per field, so one missing translation is not a blank card", () => {
        const element = {
            ...authoredOf("statement"),
            title: { et: "Tere", ru: "Здравствуйте" },
            description: { et: "Kolm minutit" }
        };
        const resolved = resolveElement(element, "ru", "et");
        expect(resolved.title).toBe("Здравствуйте");
        expect(resolved.description).toBe("Kolm minutit");
    });

    it("falls back inside an option list as readily as at the top", () => {
        const source = authoredOf("single_choice");
        const element = {
            ...source,
            title: { et: "Roll", en: "Role" },
            options: [
                { value: "dev", label: { et: "Arendaja", en: "Developer" } },
                { value: "design", label: { et: "Disainer" } },
                { value: "pm", label: { et: "Tootejuht" } }
            ]
        };
        const resolved = resolveElement(element, "en", "et");
        expect(resolved).toMatchObject({
            title: "Role",
            options: [
                { value: "dev", label: "Developer" },
                { value: "design", label: "Disainer" },
                { value: "pm", label: "Tootejuht" }
            ]
        });
    });

    it("keeps an unwritten optional field unwritten rather than blank", () => {
        const resolved = resolveElement(authoredOf("opinion_scale"), "ru");
        expect("description" in resolved).toBe(false);
    });
});

describe("resolveSurvey", () => {
    const stored = authorSurvey(survey);

    it("round-trips a whole survey through the language it was written in", () => {
        expect(resolveSurvey(stored)).toEqual(survey);
    });

    it("resolves through the survey's own locale when a translation is missing", () => {
        const half = AuthoredSurveySchema.parse({
            ...stored,
            elements: stored.elements.map(element =>
                element.id === Q.recommend
                    ? { ...element, title: { et: "Soovitus", en: "Referral" } }
                    : element
            )
        });

        const resolved = resolveSurvey(half, "en");
        const nps = must(
            resolved.elements.find(element => element.id === Q.recommend),
            "no nps element"
        );
        const role = must(
            resolved.elements.find(element => element.id === Q.role),
            "no role element"
        );

        expect(nps.title).toBe("Referral");
        // Never translated, and the survey is Estonian: the author's own words.
        expect(role.title).toBe(singleChoice.title);
        expect(SurveySchema.safeParse(resolved).success).toBe(true);
    });

    it("defaults to the survey's own language", () => {
        expect(resolveSurvey(stored)).toEqual(resolveSurvey(stored, "et"));
    });

    it("leaves everything that is not text alone", () => {
        const resolved = resolveSurvey(stored, "ru");
        expect(resolved.id).toBe(survey.id);
        expect(resolved.slug).toBe(survey.slug);
        expect(resolved.waveGroupId).toBe(survey.waveGroupId);
        expect(resolved.elements.map(element => element.key)).toEqual(
            survey.elements.map(element => element.key)
        );
    });
});

describe("authorSurvey", () => {
    it("produces a document the authored schema accepts", () => {
        expect(
            AuthoredSurveySchema.safeParse(authorSurvey(survey)).success
        ).toBe(true);
    });

    it("writes into the language asked for, not the survey's", () => {
        const stored = authorSurvey(survey, "ru");
        const role = must(
            stored.elements.find(element => element.id === Q.role),
            "no role element"
        );
        expect(role.title).toEqual({ ru: singleChoice.title });
    });
});

describe("projectElement", () => {
    it("shows only what the author has written in the language asked for", () => {
        const element = {
            ...authoredOf("single_choice"),
            title: { et: "Roll", ru: "Роль" },
            options: [
                { value: "dev", label: { et: "Arendaja", ru: "Разработчик" } },
                { value: "design", label: { et: "Disainer" } },
                { value: "pm", label: { et: "Tootejuht" } }
            ]
        };

        // No fallback anywhere: an untranslated label is a blank field for the
        // author to fill, not the Estonian they are translating from.
        expect(projectElement(element, "ru")).toMatchObject({
            title: "Роль",
            options: [
                { value: "dev", label: "Разработчик" },
                { value: "design", label: "" },
                { value: "pm", label: "" }
            ]
        });
    });

    it("leaves an untranslated optional field absent rather than blank", () => {
        const element = {
            ...authoredOf("statement"),
            description: { et: "Kolm minutit" }
        };
        expect("description" in projectElement(element, "ru")).toBe(false);
    });

    it("is resolving, for the language the survey was written in", () => {
        for (const element of authored) {
            expect(projectElement(element, "et")).toEqual(
                resolveElement(element, "et")
            );
        }
    });
});

describe("mergeElement", () => {
    const stored = {
        ...authoredOf("single_choice"),
        title: { et: "Roll", ru: "Роль" },
        otherLabel: { et: "Muu" },
        options: [
            { value: "dev", label: { et: "Arendaja" } },
            { value: "design", label: { et: "Disainer" } },
            { value: "pm", label: { et: "Tootejuht" } }
        ]
    };

    const editIn = (
        locale: "et" | "en" | "ru",
        edit: (one: SurveyElement) => SurveyElement
    ) => mergeElement(stored, edit(projectElement(stored, locale)), locale);

    it("keeps the languages the edit never saw", () => {
        const merged = editIn("ru", element => ({
            ...element,
            title: "Должность"
        }));

        expect(merged.title).toEqual({ et: "Roll", ru: "Должность" });
        // Written in Estonian, never shown to the Russian editor, still there.
        expect(merged).toMatchObject({ otherLabel: { et: "Muu" } });
    });

    it("files a translated label under the option's value, not its position", () => {
        const merged = editIn("ru", element => ({
            ...element,
            options: [
                // Reordered *and* translated in the same edit, which is what
                // makes matching on position wrong rather than merely fragile.
                { value: "pm", label: "Продакт-менеджер" },
                { value: "dev", label: "Разработчик" },
                { value: "design", label: "" }
            ]
        }));

        expect(merged).toMatchObject({
            options: [
                {
                    value: "pm",
                    label: { et: "Tootejuht", ru: "Продакт-менеджер" }
                },
                { value: "dev", label: { et: "Arendaja", ru: "Разработчик" } },
                { value: "design", label: { et: "Disainer" } }
            ]
        });
    });

    it("treats a cleared field as one language withdrawn, not as empty text", () => {
        const merged = editIn("ru", element => ({ ...element, title: "" }));
        expect(merged.title).toEqual({ et: "Roll" });
    });

    it("lets the last language of a required field go, so the save is held", () => {
        // The builder shows the field error and stops saving; storing text
        // nobody can read would be the worse of the two failures.
        const merged = mergeElement(
            { ...stored, title: { et: "Roll" } },
            { ...projectElement(stored, "et"), title: "" },
            "et"
        );
        expect(merged.title).toEqual({});
        expect(AuthoredElementSchema.safeParse(merged).success).toBe(false);
    });

    it("gives an option the edit added the language it was typed in", () => {
        const merged = editIn("ru", element => {
            if (element.type !== "single_choice") throw new Error("wrong type");
            return {
                ...element,
                options: [
                    ...element.options,
                    { value: "option_4", label: "Другое" }
                ]
            };
        });

        expect(merged).toMatchObject({
            options: [
                { value: "dev" },
                { value: "design" },
                { value: "pm" },
                { value: "option_4", label: { ru: "Другое" } }
            ]
        });
    });

    it("carries an edit that is not a word across every language", () => {
        const merged = editIn("ru", element => ({
            ...element,
            required: false,
            key: "amet"
        }));

        expect(merged.key).toBe("amet");
        expect(merged).toMatchObject({ required: false });
        expect(merged.title).toEqual({ et: "Roll", ru: "Роль" });
    });

    it("is authoring for an element the document has never held", () => {
        const [element] = mergeElements([], [singleChoice], "ru");
        expect(element).toEqual(authorElement(singleChoice, "ru"));
    });

    it("round-trips every element type through the language it was written in", () => {
        for (const element of authored) {
            expect(
                mergeElement(element, projectElement(element, "et"), "et")
            ).toEqual(element);
        }
    });
});

describe("what the author still has to write", () => {
    const stored = {
        ...authoredOf("opinion_scale"),
        title: { et: "Rahulolu", ru: "Удовлетворённость" },
        minLabel: { et: "Üldse mitte" },
        maxLabel: { et: "Väga" }
    };

    it("addresses every piece of an element's text, and nothing else", () => {
        expect([...elementTexts(stored).keys()].sort()).toEqual([
            "maxLabel",
            "minLabel",
            "title"
        ]);
    });

    it("counts the fields with no text in the language, not the elements", () => {
        // Two endpoint labels on one question is two pieces of work; counting
        // the question once would read as "nearly done" when it is not.
        expect(missingTranslations(stored, "ru")).toBe(2);
        expect(missingTranslations(stored, "et")).toBe(0);
        expect(missingTranslationCount([stored, stored], "ru")).toBe(4);
    });

    it("reads back what each field says today, which is what a placeholder shows", () => {
        const reference = referenceTexts(stored, "ru", "et");
        expect(reference.get("title")).toBe("Удовлетворённость");
        expect(reference.get("minLabel")).toBe("Üldse mitte");
    });
});

/**
 * The nine elements with every optional piece of text filled in — which the
 * shared fixtures deliberately are not, since they exist to be aggregated.
 *
 * Add a new field to an element type and add it here too: this is what makes
 * the untranslated-string test below able to see it.
 */
const FULLY_WRITTEN: readonly SurveyElement[] = [
    { ...statement, description: "Selgitus" },
    {
        ...singleChoice,
        description: "Selgitus",
        allowOther: true,
        otherLabel: "Muu"
    },
    {
        ...multiChoice,
        description: "Selgitus",
        allowOther: true,
        otherLabel: "Muu"
    },
    { ...dropdown, description: "Selgitus" },
    { ...shortText, description: "Selgitus", placeholder: "Nt Tallinn" },
    { ...longText, description: "Selgitus", placeholder: "Kirjuta siia" },
    {
        ...opinionScale,
        description: "Selgitus",
        minLabel: "Üldse mitte",
        maxLabel: "Väga"
    },
    { ...nps, description: "Selgitus" },
    { ...matrixSingle, description: "Selgitus" }
];

/** Machine-facing, and therefore the same in every language. */
const IDENTIFIER_FIELDS = ["id", "key", "type", "value"] as const;
type IdentifierField = (typeof IDENTIFIER_FIELDS)[number];

/**
 * The names of every field on `T` that holds a plain string. Distributed over
 * the union, since `keyof` a union is only what its members have in common.
 */
type BareStringFields<T> = T extends unknown
    ? {
          [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
      }[keyof T]
    : never;

/**
 * Any plain string on a *stored* element that is not an identifier — which is
 * to say, a piece of respondent-facing text that would reach them in whatever
 * language it happened to be typed in.
 *
 * There must not be any, and the assignment below is a compile error when
 * there is. The runtime guard further down asks the same question of a
 * document, and can only see fields the fixtures happen to fill in; this one
 * sees the type, so a text field added to `SurveyElementSchema` and inherited
 * by the authored shape — which is how the two variants are built — fails here
 * without anyone having to remember to extend a fixture.
 */
type UntranslatedField =
    | Exclude<BareStringFields<AuthoredElement>, IdentifierField>
    | Exclude<BareStringFields<AuthoredChoiceOption>, IdentifierField>;

const noUntranslatedFields: [UntranslatedField] extends [never]
    ? true
    : ["untranslated text on the stored element:", UntranslatedField] = true;

/**
 * Every string in an authored document that is neither an identifier nor one
 * language's entry in a `LocalizedText` — which is to say, every piece of text
 * that would reach a respondent in whatever language it happened to be typed
 * in. There must not be any.
 */
function untranslatedFields(document: unknown): readonly string[] {
    const found: string[] = [];
    const locales: readonly string[] = LOCALES;
    const identifiers: readonly string[] = IDENTIFIER_FIELDS;

    JSON.stringify(document, (key, value) => {
        if (
            typeof value === "string" &&
            !identifiers.includes(key) &&
            !locales.includes(key)
        ) {
            found.push(key);
        }
        return value;
    });

    return found;
}

describe("the two shapes of an element", () => {
    it("has no plain string on the stored shape but an identifier", () => {
        // The assertion is the type of `noUntranslatedFields`; this only
        // keeps it from being dead code.
        expect(noUntranslatedFields).toBe(true);
    });

    it("agrees that the fully written fixtures are valid to begin with", () => {
        for (const element of FULLY_WRITTEN) {
            expect(SurveyElementSchema.safeParse(element).success).toBe(true);
        }
    });

    it("leaves no respondent-facing string untranslated, for any element type", () => {
        for (const element of FULLY_WRITTEN) {
            // Parsed rather than trusted: an authored schema that had no home
            // for a field would strip it here, and the round trip would lose
            // it silently.
            const stored = AuthoredElementSchema.parse(
                authorElement(element, "et")
            );
            expect(untranslatedFields(stored)).toEqual([]);
            expect(resolveElement(stored, "et")).toEqual(element);
        }
    });
});
