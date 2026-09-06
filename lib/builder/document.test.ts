import { describe, expect, it } from "vitest";

import { questionId } from "@/domain/ids";
import type { QuestionId } from "@/domain/ids";
import type { SingleChoiceQuestion, SurveyElement } from "@/domain/question";
import {
    documentReducer,
    findElement,
    initialDocument,
    moveElement,
    type BuilderDocument
} from "@/lib/builder/document";

const id = (n: number): QuestionId =>
    questionId(`44444444-4444-4444-8444-${String(n).padStart(12, "0")}`);

function question(n: number): SingleChoiceQuestion {
    return {
        id: id(n),
        key: `q${n}`,
        type: "single_choice",
        isAnswerable: true,
        title: `Question ${n}`,
        required: true,
        allowOther: false,
        options: [
            { value: "option_1", label: "One" },
            { value: "option_2", label: "Two" }
        ]
    };
}

const keys = (document: BuilderDocument) =>
    document.elements.map(element => element.key);

const three = [question(1), question(2), question(3)];

describe("initialDocument", () => {
    it("selects the first element", () => {
        expect(initialDocument(three).selectedId).toBe(id(1));
    });

    it("selects nothing when the survey is empty", () => {
        const document = initialDocument([]);
        expect(document.selectedId).toBeNull();
        expect(document.revision).toBe(0);
    });
});

describe("moveElement", () => {
    it("moves an element down", () => {
        expect(moveElement(three, 0, 2).map(element => element.key)).toEqual([
            "q2",
            "q3",
            "q1"
        ]);
    });

    it("moves an element up", () => {
        expect(moveElement(three, 2, 0).map(element => element.key)).toEqual([
            "q3",
            "q1",
            "q2"
        ]);
    });

    it("clamps a target past the end", () => {
        expect(moveElement(three, 0, 99).map(element => element.key)).toEqual([
            "q2",
            "q3",
            "q1"
        ]);
    });

    it("returns the same array when nothing moves", () => {
        expect(moveElement(three, 1, 1)).toBe(three);
        expect(moveElement(three, 9, 0)).toBe(three);
    });
});

describe("documentReducer", () => {
    const start = initialDocument(three);

    it("selecting is not an edit", () => {
        const next = documentReducer(start, { kind: "select", id: id(3) });
        expect(next.selectedId).toBe(id(3));
        expect(next.revision).toBe(start.revision);
    });

    it("re-selecting the current element changes nothing", () => {
        expect(documentReducer(start, { kind: "select", id: id(1) })).toBe(
            start
        );
    });

    it("appends a new element and selects it", () => {
        const added = question(4);
        const next = documentReducer(start, { kind: "add", element: added });

        expect(keys(next)).toEqual(["q1", "q2", "q3", "q4"]);
        expect(next.selectedId).toBe(added.id);
        expect(next.revision).toBe(1);
    });

    it("removing the selected element selects the one that takes its place", () => {
        const next = documentReducer(start, { kind: "remove", id: id(1) });

        expect(keys(next)).toEqual(["q2", "q3"]);
        expect(next.selectedId).toBe(id(2));
        expect(next.revision).toBe(1);
    });

    it("removing the last element selects the one before it", () => {
        const selectedLast = documentReducer(start, {
            kind: "select",
            id: id(3)
        });
        const next = documentReducer(selectedLast, {
            kind: "remove",
            id: id(3)
        });

        expect(next.selectedId).toBe(id(2));
    });

    it("removing the only element leaves nothing selected", () => {
        const next = documentReducer(initialDocument([question(1)]), {
            kind: "remove",
            id: id(1)
        });

        expect(next.elements).toEqual([]);
        expect(next.selectedId).toBeNull();
    });

    it("removing an unselected element leaves the selection alone", () => {
        const next = documentReducer(start, { kind: "remove", id: id(3) });
        expect(next.selectedId).toBe(id(1));
    });

    it("ignores a removal of something that is not there", () => {
        expect(documentReducer(start, { kind: "remove", id: id(9) })).toBe(
            start
        );
    });

    it("moves an element and counts it as an edit", () => {
        const next = documentReducer(start, { kind: "move", id: id(1), to: 2 });

        expect(keys(next)).toEqual(["q2", "q3", "q1"]);
        expect(next.selectedId).toBe(id(1));
        expect(next.revision).toBe(1);
    });

    it("does not count a drag that ends where it started", () => {
        expect(documentReducer(start, { kind: "move", id: id(2), to: 1 })).toBe(
            start
        );
    });

    it("replaces an element in place", () => {
        const edited: SurveyElement = { ...question(2), title: "Reworded" };
        const next = documentReducer(start, {
            kind: "replace",
            element: edited
        });

        expect(next.elements[1]).toBe(edited);
        expect(keys(next)).toEqual(["q1", "q2", "q3"]);
        expect(next.revision).toBe(1);
    });

    it("ignores a replacement of an element that has been deleted", () => {
        expect(
            documentReducer(start, { kind: "replace", element: question(9) })
        ).toBe(start);
    });
});

describe("findElement", () => {
    it("finds by id and returns null for nothing selected", () => {
        expect(findElement(three, id(2))?.key).toBe("q2");
        expect(findElement(three, null)).toBeNull();
        expect(findElement(three, id(9))).toBeNull();
    });
});
