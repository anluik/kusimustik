import { describe, expect, it } from "vitest";

import {
    LOCALES,
    localizedText,
    localizedTextSchema,
    resolveOptionalText,
    resolveText,
    writtenLocales
} from "@/domain/content";
import type { LocalizedText } from "@/domain/content";

const schema = localizedTextSchema(20);

describe("localizedTextSchema", () => {
    it("accepts text in one language", () => {
        expect(schema.parse({ et: "Küsimus" })).toEqual({ et: "Küsimus" });
    });

    it("accepts text in every language", () => {
        const text = { et: "Küsimus", en: "Question", ru: "Вопрос" };
        expect(schema.parse(text)).toEqual(text);
    });

    it("rejects a map with no text in it at all", () => {
        expect(schema.safeParse({}).success).toBe(false);
    });

    it("rejects an empty translation rather than storing a blank", () => {
        expect(schema.safeParse({ et: "" }).success).toBe(false);
    });

    it("rejects a language the product does not have", () => {
        expect(schema.safeParse({ fi: "Kysymys" }).success).toBe(false);
    });

    it("applies the length limit per language, not in total", () => {
        expect(
            schema.safeParse({ et: "a".repeat(20), en: "b".repeat(20) }).success
        ).toBe(true);
        expect(schema.safeParse({ et: "a".repeat(21) }).success).toBe(false);
    });

    it("rejects a bare string: the shape changed, and silently lifting one would hide it", () => {
        expect(schema.safeParse("Küsimus").success).toBe(false);
    });
});

describe("localizedText", () => {
    it("writes one language", () => {
        expect(localizedText("ru", "Вопрос")).toEqual({ ru: "Вопрос" });
    });

    it("produces something the schema accepts for every locale", () => {
        for (const locale of LOCALES) {
            expect(schema.safeParse(localizedText(locale, "ok")).success).toBe(
                true
            );
        }
    });
});

describe("resolveText", () => {
    const text: LocalizedText = { et: "Küsimus", en: "Question" };

    it("returns the language asked for", () => {
        expect(resolveText(text, "en", "et")).toBe("Question");
    });

    it("falls back to the survey's own language when the translation is missing", () => {
        expect(resolveText(text, "ru", "et")).toBe("Küsimus");
    });

    it("falls back to whatever the author wrote when even that is missing", () => {
        expect(resolveText({ ru: "Вопрос" }, "en", "et")).toBe("Вопрос");
    });

    it("prefers the first written language in LOCALES order, so it is stable", () => {
        expect(resolveText({ ru: "Вопрос", en: "Question" }, "et", "et")).toBe(
            "Question"
        );
    });

    it("answers a document with no text at all with an empty string", () => {
        expect(resolveText({}, "et", "et")).toBe("");
    });
});

describe("resolveOptionalText", () => {
    it("leaves an unwritten optional field unwritten", () => {
        expect(resolveOptionalText(undefined, "et", "et")).toBeUndefined();
    });

    it("resolves a written one", () => {
        expect(resolveOptionalText({ en: "Other" }, "et", "et")).toBe("Other");
    });
});

describe("writtenLocales", () => {
    it("lists the languages in LOCALES order", () => {
        expect(writtenLocales({ ru: "Вопрос", et: "Küsimus" })).toEqual([
            "et",
            "ru"
        ]);
    });

    it("is empty for text nobody has written", () => {
        expect(writtenLocales({})).toEqual([]);
    });
});
