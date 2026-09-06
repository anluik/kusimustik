import { describe, expect, it } from "vitest";

import type { SurveyElement } from "@/domain/question";
import { keyPolicyFor, nextKeyFor } from "@/lib/builder/keys";
import { createElement } from "@/lib/builder/new-element";

const defaults = {
    title: "Uus küsimus",
    optionLabel: (index: number) => `Valik ${index}`
};

const element = (title: string, siblings: readonly SurveyElement[] = []) =>
    createElement("single_choice", { ...defaults, title }, siblings);

describe("keyPolicyFor", () => {
    it("derives only for a survey nothing can be joined against yet", () => {
        expect(keyPolicyFor({ publishedVersion: null, waveCount: 1 })).toBe(
            "derive"
        );
    });

    it("freezes once the survey has been published", () => {
        // Answers exist against these keys, and the CSV columns are named for
        // them.
        expect(keyPolicyFor({ publishedVersion: 2, waveCount: 1 })).toBe(
            "freeze"
        );
    });

    it("freezes once the survey has a sibling wave", () => {
        // Wave comparison joins wave to wave on the key, so a draft second
        // wave's keys are already load-bearing. See docs/DECISIONS.md 003.
        expect(keyPolicyFor({ publishedVersion: null, waveCount: 2 })).toBe(
            "freeze"
        );
    });
});

describe("nextKeyFor", () => {
    it("follows the title while the key is still the derived one", () => {
        const question = element("Uus küsimus");
        expect(
            nextKeyFor(question, "Kui rahul oled?", [question], "derive")
        ).toBe("kui_rahul_oled");
    });

    it("folds Estonian diacritics rather than dropping the words", () => {
        const question = element("Uus küsimus");
        expect(nextKeyFor(question, "Töö tempo", [question], "derive")).toBe(
            "too_tempo"
        );
    });

    it("avoids a sibling's key", () => {
        const first = element("Töö tempo");
        const second = element("Uus küsimus", [first]);

        expect(nextKeyFor(second, "Töö tempo", [first, second], "derive")).toBe(
            "too_tempo_2"
        );
    });

    it("keeps a key the owner has diverged from the title", () => {
        const question: SurveyElement = {
            ...element("Uus küsimus"),
            key: "nps_overall"
        };

        expect(
            nextKeyFor(question, "Kui rahul oled?", [question], "derive")
        ).toBe("nps_overall");
    });

    it("never moves a frozen key", () => {
        const question = element("Uus küsimus");
        expect(
            nextKeyFor(question, "Kui rahul oled?", [question], "freeze")
        ).toBe("uus_kusimus");
    });
});
