import { describe, expect, it } from "vitest";

import {
    authorElement,
    authorElements,
    authorSurvey,
    resolveElement,
    resolveElements,
    resolveSurvey
} from "@/domain/localize";
import type { AuthoredElement } from "@/domain/question";
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
const IDENTIFIER_FIELDS = new Set(["id", "key", "type", "value"]);

/**
 * Every string in an authored document that is neither an identifier nor one
 * language's entry in a `LocalizedText` — which is to say, every piece of text
 * that would reach a respondent in whatever language it happened to be typed
 * in. There must not be any.
 */
function untranslatedFields(document: unknown): readonly string[] {
    const found: string[] = [];
    const locales: readonly string[] = LOCALES;

    JSON.stringify(document, (key, value) => {
        if (
            typeof value === "string" &&
            !IDENTIFIER_FIELDS.has(key) &&
            !locales.includes(key)
        ) {
            found.push(key);
        }
        return value;
    });

    return found;
}

describe("the two shapes of an element", () => {
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
