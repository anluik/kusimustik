import { describe, expect, it } from "vitest";

import { SurveyElementSchema } from "@/domain/question";
import type {
    MultiChoiceQuestion,
    OpinionScaleQuestion,
    ShortTextQuestion
} from "@/domain/question";
import {
    readOptionalNumber,
    withDescription,
    withMaxLength,
    withOther,
    withPlaceholder,
    withScaleLabel,
    withSelectionBound,
    withSelectionBoundsInRange
} from "@/lib/builder/element-patch";
import { createElement } from "@/lib/builder/new-element";
import type { SurveyKeys } from "@/lib/builder/keys";

const KEYS: SurveyKeys = { policy: "derive", reserved: [] };

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

function multiChoice(): MultiChoiceQuestion {
    const element = createElement("multi_choice", defaults, [], KEYS);
    if (element.type !== "multi_choice") throw new Error("wrong type");
    return element;
}

function shortText(): ShortTextQuestion {
    const element = createElement("short_text", defaults, [], KEYS);
    if (element.type !== "short_text") throw new Error("wrong type");
    return element;
}

function scale(): OpinionScaleQuestion {
    const element = createElement("opinion_scale", defaults, [], KEYS);
    if (element.type !== "opinion_scale") throw new Error("wrong type");
    return element;
}

describe("withDescription", () => {
    it("removes the field rather than storing an empty string", () => {
        const element = withDescription(multiChoice(), "Selgitus");
        expect(element.description).toBe("Selgitus");
        expect(withDescription(element, "   ")).not.toHaveProperty(
            "description"
        );
    });
});

describe("withOther", () => {
    it("carries a label in, because the schema requires one", () => {
        const element = withOther(multiChoice(), true, "Muu");
        expect(element).toMatchObject({ allowOther: true, otherLabel: "Muu" });
        expect(SurveyElementSchema.safeParse(element).success).toBe(true);
    });

    it("keeps the label the owner wrote", () => {
        const named = withOther(multiChoice(), true, "Muu");
        if (named.type !== "multi_choice") throw new Error("wrong type");
        const relabelled = { ...named, otherLabel: "Midagi muud" };

        expect(withOther(relabelled, true, "Muu")).toMatchObject({
            otherLabel: "Midagi muud"
        });
    });

    it("takes the label away again, leaving nothing stale behind", () => {
        const on = withOther(multiChoice(), true, "Muu");
        if (on.type !== "multi_choice") throw new Error("wrong type");

        expect(withOther(on, false, "Muu")).not.toHaveProperty("otherLabel");
    });
});

describe("withSelectionBound", () => {
    it("pulls the maximum up rather than storing min > max", () => {
        const bounded = withSelectionBound(multiChoice(), "maxSelections", 1);
        if (bounded.type !== "multi_choice") throw new Error("wrong type");

        const raised = withSelectionBound(bounded, "minSelections", 2);
        expect(raised).toMatchObject({ minSelections: 2, maxSelections: 2 });
        expect(SurveyElementSchema.safeParse(raised).success).toBe(true);
    });

    it("pulls the minimum down rather than storing max < min", () => {
        const bounded = withSelectionBound(multiChoice(), "minSelections", 2);
        if (bounded.type !== "multi_choice") throw new Error("wrong type");

        expect(withSelectionBound(bounded, "maxSelections", 1)).toMatchObject({
            minSelections: 1,
            maxSelections: 1
        });
    });

    it("clamps to the number of selections actually on offer", () => {
        // Two options and no "other": asking for four is not a document the
        // schema would take.
        expect(
            withSelectionBound(multiChoice(), "maxSelections", 4)
        ).toMatchObject({ maxSelections: 2 });
    });

    it("removes the bound when it is cleared", () => {
        const bounded = withSelectionBound(multiChoice(), "minSelections", 2);
        if (bounded.type !== "multi_choice") throw new Error("wrong type");

        expect(
            withSelectionBound(bounded, "minSelections", undefined)
        ).not.toHaveProperty("minSelections");
    });
});

describe("withSelectionBoundsInRange", () => {
    it("re-clamps after an option was deleted under the bound", () => {
        const bounded = withSelectionBound(multiChoice(), "maxSelections", 2);
        if (bounded.type !== "multi_choice") throw new Error("wrong type");

        const shortened = withSelectionBoundsInRange({
            ...bounded,
            options: [bounded.options[0] ?? { value: "option_1", label: "A" }]
        });

        expect(shortened.maxSelections).toBe(1);
    });

    it("leaves bounds that still fit alone", () => {
        const bounded = withSelectionBound(multiChoice(), "maxSelections", 2);
        if (bounded.type !== "multi_choice") throw new Error("wrong type");

        expect(withSelectionBoundsInRange(bounded).maxSelections).toBe(2);
    });
});

describe("text question fields", () => {
    it("removes a cleared maximum length and placeholder", () => {
        const limited = withMaxLength(shortText(), 120);
        expect(limited).toMatchObject({ maxLength: 120 });

        if (limited.type !== "short_text") throw new Error("wrong type");
        expect(withMaxLength(limited, undefined)).not.toHaveProperty(
            "maxLength"
        );
        expect(withPlaceholder(limited, "  ")).not.toHaveProperty(
            "placeholder"
        );
    });
});

describe("withScaleLabel", () => {
    it("sets and clears each end independently", () => {
        const low = withScaleLabel(scale(), "minLabel", "Ei nõustu");
        expect(low).toMatchObject({ minLabel: "Ei nõustu" });

        if (low.type !== "opinion_scale") throw new Error("wrong type");
        const cleared = withScaleLabel(low, "minLabel", "");
        expect(cleared).not.toHaveProperty("minLabel");
        expect(cleared).not.toHaveProperty("maxLabel");
    });
});

describe("readOptionalNumber", () => {
    it("reads an empty field as no bound at all, not as zero", () => {
        expect(readOptionalNumber("")).toBeUndefined();
        expect(readOptionalNumber("  ")).toBeUndefined();
        expect(readOptionalNumber("abc")).toBeUndefined();
        expect(readOptionalNumber("12")).toBe(12);
    });
});
