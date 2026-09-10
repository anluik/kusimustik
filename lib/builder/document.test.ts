import { describe, expect, it } from "vitest";

import { questionId } from "@/domain/ids";
import type { QuestionId } from "@/domain/ids";
import { authorElement } from "@/domain/localize";
import type {
    AuthoredElement,
    SingleChoiceQuestion,
    SurveyElement
} from "@/domain/question";
import type { AuthoredSurveyHead } from "@/domain/survey";
import {
    HEAD,
    documentReducer,
    findElement,
    initialDocument,
    moveItem,
    type BuilderDocument
} from "@/lib/builder/document";

const id = (n: number): QuestionId =>
    questionId(`44444444-4444-4444-8444-${String(n).padStart(12, "0")}`);

/** One language of a question, as the editor panel hands it back. */
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

/** The same question as the document holds it: Estonian and nothing else. */
const stored = (n: number): AuthoredElement => authorElement(question(n), "et");

const keys = (document: BuilderDocument) =>
    document.elements.map(element => element.key);

const three = [stored(1), stored(2), stored(3)];

/** The survey's own words, written in Estonian and translated into nothing. */
const head: AuthoredSurveyHead = {
    title: { et: "Maine ja rahulolu" },
    description: { et: "Kolm minutit." }
};

const document = (elements: readonly AuthoredElement[] = three) =>
    initialDocument(head, elements);

describe("initialDocument", () => {
    it("selects the survey's own head, which is the first thing in the list", () => {
        expect(document().selectedId).toBe(HEAD);
    });

    it("selects it on an empty survey too, so the panel is never empty", () => {
        // Every survey has a head, which is why nothing-selected is no longer
        // a state the builder can be in.
        const empty = document([]);
        expect(empty.selectedId).toBe(HEAD);
        expect(empty.revision).toBe(0);
    });
});

describe("replaceHead", () => {
    it("merges one language and leaves the others where they were", () => {
        const translated = documentReducer(
            {
                ...document(),
                head: { title: { et: "Maine", ru: "Репутация" } }
            },
            {
                kind: "replaceHead",
                head: { title: "Репутация 2026" },
                locale: "ru"
            }
        );

        expect(translated.head.title).toEqual({
            et: "Maine",
            ru: "Репутация 2026"
        });
    });

    it("counts as an edit, so the autosave picks it up", () => {
        const next = documentReducer(document(), {
            kind: "replaceHead",
            head: { title: "Uus nimi", description: "Kolm minutit." },
            locale: "et"
        });
        expect(next.revision).toBe(1);
    });

    it("applies an edit the schema will refuse rather than dropping it", () => {
        // Emptying the last language of the title is a real edit and the owner
        // must see it land; holding the save is the hook's business, not the
        // reducer's.
        const emptied = documentReducer(document(), {
            kind: "replaceHead",
            head: { title: "" },
            locale: "et"
        });
        expect(emptied.head.title).toEqual({});
        expect(emptied.revision).toBe(1);
    });

    it("leaves the elements alone", () => {
        const next = documentReducer(document(), {
            kind: "replaceHead",
            head: { title: "Uus nimi" },
            locale: "et"
        });
        expect(next.elements).toBe(three);
    });
});

describe("duplicate", () => {
    const start = document();
    const copy: AuthoredElement = { ...stored(2), id: id(9), key: "q2_2" };

    it("inserts the copy directly after its source", () => {
        const next = documentReducer(start, {
            kind: "duplicate",
            id: id(2),
            copy
        });

        expect(keys(next)).toEqual(["q1", "q2", "q2_2", "q3"]);
    });

    it("selects the copy, since that is what the owner now edits", () => {
        const next = documentReducer(start, {
            kind: "duplicate",
            id: id(2),
            copy
        });

        expect(next.selectedId).toBe(id(9));
        expect(next.revision).toBe(start.revision + 1);
    });

    it("ignores an element that is not in the document", () => {
        expect(
            documentReducer(start, { kind: "duplicate", id: id(8), copy })
        ).toBe(start);
    });
});

describe("moveItem", () => {
    it("moves an element down", () => {
        expect(moveItem(three, 0, 2).map(element => element.key)).toEqual([
            "q2",
            "q3",
            "q1"
        ]);
    });

    it("moves an element up", () => {
        expect(moveItem(three, 2, 0).map(element => element.key)).toEqual([
            "q3",
            "q1",
            "q2"
        ]);
    });

    it("clamps a target past the end", () => {
        expect(moveItem(three, 0, 99).map(element => element.key)).toEqual([
            "q2",
            "q3",
            "q1"
        ]);
    });

    it("returns the same array when nothing moves", () => {
        expect(moveItem(three, 1, 1)).toBe(three);
        expect(moveItem(three, 9, 0)).toBe(three);
    });
});

describe("documentReducer", () => {
    const start = document();

    it("selecting is not an edit", () => {
        const next = documentReducer(start, { kind: "select", id: id(3) });
        expect(next.selectedId).toBe(id(3));
        expect(next.revision).toBe(start.revision);
    });

    it("re-selecting what is already selected changes nothing", () => {
        expect(documentReducer(start, { kind: "select", id: HEAD })).toBe(
            start
        );
    });

    it("appends a new element and selects it", () => {
        const added = stored(4);
        const next = documentReducer(start, { kind: "add", element: added });

        expect(keys(next)).toEqual(["q1", "q2", "q3", "q4"]);
        expect(next.selectedId).toBe(added.id);
        expect(next.revision).toBe(1);
    });

    it("removing the selected element selects the one that takes its place", () => {
        const selectedFirst = documentReducer(start, {
            kind: "select",
            id: id(1)
        });
        const next = documentReducer(selectedFirst, {
            kind: "remove",
            id: id(1)
        });

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

    it("removing the only element falls back to the head", () => {
        // There is always something to select, so a survey emptied of its
        // questions still has its title in the editor panel.
        const next = documentReducer(document([stored(1)]), {
            kind: "remove",
            id: id(1)
        });

        expect(next.elements).toEqual([]);
        expect(next.selectedId).toBe(HEAD);
    });

    it("removing an unselected element leaves the selection alone", () => {
        const next = documentReducer(start, { kind: "remove", id: id(3) });
        expect(next.selectedId).toBe(HEAD);
    });

    it("ignores a removal of something that is not there", () => {
        expect(documentReducer(start, { kind: "remove", id: id(9) })).toBe(
            start
        );
    });

    it("moves an element and counts it as an edit", () => {
        const next = documentReducer(start, { kind: "move", id: id(1), to: 2 });

        expect(keys(next)).toEqual(["q2", "q3", "q1"]);
        expect(next.selectedId).toBe(HEAD);
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
            element: edited,
            locale: "et"
        });

        expect(next.elements[1]?.title).toEqual({ et: "Reworded" });
        expect(keys(next)).toEqual(["q1", "q2", "q3"]);
        expect(next.revision).toBe(1);
    });

    it("merges an edit into the languages it did not show", () => {
        // The panel is editing Russian, so what it hands back has Russian in
        // its title field and nothing else. The Estonian it never showed has
        // to survive that, or translating a survey would delete it.
        const translated = documentReducer(document([stored(2)]), {
            kind: "replace",
            element: { ...question(2), title: "Вопрос 2" },
            locale: "ru"
        });

        expect(translated.elements[0]?.title).toEqual({
            et: "Question 2",
            ru: "Вопрос 2"
        });
    });

    it("ignores a replacement of an element that has been deleted", () => {
        expect(
            documentReducer(start, {
                kind: "replace",
                element: question(9),
                locale: "et"
            })
        ).toBe(start);
    });
});

describe("findElement", () => {
    it("finds by id, and answers the head with nothing", () => {
        // The head is not an element, so looking it up here is a question with
        // no answer rather than an error.
        expect(findElement(three, id(2))?.key).toBe("q2");
        expect(findElement(three, HEAD)).toBeNull();
        expect(findElement(three, id(9))).toBeNull();
    });
});
