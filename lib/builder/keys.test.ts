import { describe, expect, it } from "vitest";

import type { SurveyElement } from "@/domain/question";
import {
    keyPolicyFor,
    nextKeyFor,
    takenKeys,
    type SurveyKeys
} from "@/lib/builder/keys";
import { createElement } from "@/lib/builder/new-element";

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

/** The common case: nothing removed, so nothing reserved. */
const DERIVE: SurveyKeys = { policy: "derive", reserved: [] };
const FREEZE: SurveyKeys = { policy: "freeze", reserved: [] };

const element = (
    title: string,
    siblings: readonly SurveyElement[] = [],
    keys: SurveyKeys = DERIVE
) => createElement("single_choice", { ...defaults, title }, siblings, keys);

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
            nextKeyFor(question, "Kui rahul oled?", [question], DERIVE)
        ).toBe("kui_rahul_oled");
    });

    it("folds Estonian diacritics rather than dropping the words", () => {
        const question = element("Uus küsimus");
        expect(nextKeyFor(question, "Töö tempo", [question], DERIVE)).toBe(
            "too_tempo"
        );
    });

    it("avoids a sibling's key", () => {
        const first = element("Töö tempo");
        const second = element("Uus küsimus", [first]);

        expect(nextKeyFor(second, "Töö tempo", [first, second], DERIVE)).toBe(
            "too_tempo_2"
        );
    });

    it("keeps a key the owner has diverged from the title", () => {
        const question: SurveyElement = {
            ...element("Uus küsimus"),
            key: "nps_overall"
        };

        expect(
            nextKeyFor(question, "Kui rahul oled?", [question], DERIVE)
        ).toBe("nps_overall");
    });

    it("never moves a frozen key", () => {
        const question = element("Uus küsimus");
        expect(
            nextKeyFor(question, "Kui rahul oled?", [question], FREEZE)
        ).toBe("uus_kusimus");
    });
});

describe("takenKeys", () => {
    it("lists the document's keys", () => {
        const first = element("Töö tempo");
        const second = element("Kui rahul oled?", [first]);
        expect(takenKeys([first, second], DERIVE)).toEqual([
            "too_tempo",
            "kui_rahul_oled"
        ]);
    });

    it("lets the element being edited keep its own key", () => {
        const first = element("Töö tempo");
        const second = element("Kui rahul oled?", [first]);
        expect(takenKeys([first, second], DERIVE, second)).toEqual([
            "too_tempo"
        ]);
    });

    it("counts a removed question's key as spent", () => {
        // A question that left the document but kept its answers keeps its key
        // too, and the database enforces that; see the 20260908120000
        // migration.
        const keys: SurveyKeys = { policy: "freeze", reserved: ["linn"] };
        expect(takenKeys([], keys)).toEqual(["linn"]);
    });
});

describe("keys a removed question still holds", () => {
    const reserved: SurveyKeys = { policy: "derive", reserved: ["too_tempo"] };

    it("are not handed to a new question of the same name", () => {
        expect(element("Töö tempo", [], reserved).key).toBe("too_tempo_2");
    });

    it("are not taken by a retitle either", () => {
        const question = element("Uus küsimus", [], reserved);
        expect(nextKeyFor(question, "Töö tempo", [question], reserved)).toBe(
            "too_tempo_2"
        );
    });
});
