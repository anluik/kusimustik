import { describe, expect, it } from "vitest";

import et from "@/messages/app/et.json";
import en from "@/messages/app/en.json";
import ru from "@/messages/app/ru.json";
import { elementCopy } from "@/lib/builder/element-copy";
import type { ElementCopyMessages } from "@/lib/i18n/messages";

/**
 * The words a new element is born with follow the *survey's* language, not the
 * app's.
 *
 * This is a whole-catalogue test on purpose: the failure it exists for is a
 * missing key in one language, which no amount of testing Estonian would find.
 * Every seed is read from every catalogue, so a translation that never got
 * `otherLabel` fails here rather than seeding an Estonian word into a Russian
 * survey.
 */

const MESSAGES: ElementCopyMessages = {
    et: et.Builder.defaults,
    en: en.Builder.defaults,
    ru: ru.Builder.defaults
};

describe("elementCopy", () => {
    it("reads every seed out of the language asked for", () => {
        expect(elementCopy(MESSAGES, "ru").title).toBe(
            ru.Builder.defaults.questionTitle
        );
        expect(elementCopy(MESSAGES, "en").otherLabel).toBe(
            en.Builder.defaults.otherLabel
        );
        expect(elementCopy(MESSAGES, "et").statementTitle).toBe(
            et.Builder.defaults.statementTitle
        );
    });

    it("formats a numbered label in that language", () => {
        // ICU, not string concatenation: the placeholder sits in a different
        // place in each catalogue and only the formatter knows where.
        expect(elementCopy(MESSAGES, "ru").optionLabel(3)).toBe(
            ru.Builder.defaults.optionLabel.replace("{index}", "3")
        );
    });

    it("names a new entry after the list it joins", () => {
        const copy = elementCopy(MESSAGES, "et");
        expect(copy.newLabel("options", 2)).toBe(copy.optionLabel(2));
        expect(copy.newLabel("rows", 2)).toBe(copy.rowLabel(2));
        expect(copy.newLabel("columns", 2)).toBe(copy.columnLabel(2));
    });

    it("gives every language every seed", () => {
        for (const locale of ["et", "en", "ru"] as const) {
            const copy = elementCopy(MESSAGES, locale);
            for (const seed of [
                copy.title,
                copy.statementTitle,
                copy.otherLabel,
                copy.optionLabel(1),
                copy.rowLabel(1),
                copy.columnLabel(1)
            ]) {
                expect(seed.trim()).not.toBe("");
            }
        }
    });
});
