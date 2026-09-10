import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SurveyLocale } from "@/domain/content";
import { newSurveyId } from "@/domain/ids";
import { authorElement } from "@/domain/localize";
import type { AuthoredElement, SurveyElement } from "@/domain/question";
import type { SurveyKeys } from "@/lib/builder/keys";
import { createElement } from "@/lib/builder/new-element";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";

/**
 * The autosave's two gates — what it refuses to send, and which keys it
 * considers spent — and the seam between the stored document and the one
 * language of it the editor panel sees.
 *
 * The gates exist because a save that goes out and fails is not recoverable
 * from the builder: the document is unchanged, so every retry re-sends it and
 * fails identically. Anything the server or the database would reject has to
 * be caught before the request, not after it.
 *
 * The seam has the opposite failure mode — it fails silently. An edit made in
 * Russian that overwrote the document rather than merging into it would delete
 * the Estonian nobody was looking at, and the survey would go on rendering
 * perfectly until somebody opened the language that is now empty.
 */

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surveys/actions", () => ({ saveSurveyDocumentAction: save }));

const SURVEY_ID = newSurveyId();

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

const KEYS: SurveyKeys = { policy: "derive", reserved: [] };

/** One language of a question, as the editor panel hands one back. */
const question = (title: string, siblings: readonly AuthoredElement[] = []) =>
    createElement("nps", { ...defaults, title }, siblings, KEYS);

/** The same, as the document holds it: Estonian and nothing else. */
const stored = (title: string, siblings: readonly AuthoredElement[] = []) =>
    authorElement(question(title, siblings), "et");

/** A survey written in Estonian and translated into nothing. */
const HEAD_FIXTURE = { title: { et: "Maine ja rahulolu" } };

function builderWith(
    initialElements: readonly AuthoredElement[],
    {
        keys = KEYS,
        locale = "et"
    }: { readonly keys?: SurveyKeys; readonly locale?: SurveyLocale } = {}
) {
    return renderHook(() =>
        useSurveyBuilder({
            surveyId: SURVEY_ID,
            initialHead: HEAD_FIXTURE,
            initialElements,
            initialVersion: 1,
            keys,
            source: "et",
            locale
        })
    );
}

/** What the last save sent, which is the only shape that reaches the column. */
const saved = (): readonly AuthoredElement[] =>
    save.mock.calls.at(-1)?.[0].elements;

beforeEach(() => {
    save.mockReset();
    save.mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("the save gate", () => {
    it("holds a document whose questions collide on a key", async () => {
        const first = stored("Töö tempo");
        const second = stored("Kui rahul oled?", [first]);
        const { result } = builderWith([first, second]);

        act(() => {
            result.current.replace({
                ...result.current.elements[1]!,
                key: first.key
            });
        });

        expect(result.current.status).toEqual({ kind: "invalid" });
        await new Promise(resolve => setTimeout(resolve, 900));
        expect(save).not.toHaveBeenCalled();
    });

    it("resumes the moment the collision is resolved", async () => {
        const first = stored("Töö tempo");
        const second = stored("Kui rahul oled?", [first]);
        const { result } = builderWith([first, second]);

        act(() => {
            result.current.replace({
                ...result.current.elements[1]!,
                key: first.key
            });
        });
        act(() => {
            result.current.replace({
                ...result.current.elements[1]!,
                key: "kui_rahul"
            });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });

    it("does not hold a document merely because a translation is missing", async () => {
        // A title with no Russian is a normal state, not a broken document:
        // the runner falls back to Estonian. Holding the save on it would stop
        // the builder saving for as long as a translation is unfinished.
        const { result } = builderWith([stored("Töö tempo")], {
            locale: "ru"
        });

        expect(result.current.elements[0]?.title).toBe("");
        expect(result.current.status).toEqual({ kind: "clean" });

        act(() => {
            result.current.replace({
                ...result.current.elements[0]!,
                title: "Темп работы"
            });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });
});

describe("the language being edited", () => {
    it("shows only what the author has written in it", () => {
        const { result } = builderWith([stored("Töö tempo")], {
            locale: "ru"
        });

        // Blank in the panel, Estonian in the preview: the author sees what
        // is missing and what a respondent would read today.
        expect(result.current.elements[0]?.title).toBe("");
        expect(result.current.shown[0]?.title).toBe("Töö tempo");
    });

    it("merges an edit rather than replacing the document's text", async () => {
        const { result } = builderWith([stored("Töö tempo")], {
            locale: "ru"
        });

        act(() => {
            result.current.replace({
                ...result.current.elements[0]!,
                title: "Темп работы"
            });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(saved()[0]?.title).toEqual({
            et: "Töö tempo",
            ru: "Темп работы"
        });
    });

    it("clearing a translation removes that language, not the text", async () => {
        const start: AuthoredElement = {
            ...stored("Töö tempo"),
            title: { et: "Töö tempo", ru: "Темп работы" }
        };
        const { result } = builderWith([start], { locale: "ru" });

        act(() => {
            result.current.replace({
                ...result.current.elements[0]!,
                title: ""
            });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(saved()[0]?.title).toEqual({ et: "Töö tempo" });
    });

    it("adds a new element in the survey's own language, not the one on screen", async () => {
        const { result } = builderWith([], { locale: "ru" });

        act(() => {
            result.current.add(question("Uus küsimus"));
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(saved()[0]?.title).toEqual({ et: "Uus küsimus" });
    });

    it("freezes question keys while a translation is being edited", () => {
        // The key names a CSV column and joins this wave to the next one, so
        // it cannot follow a Russian title.
        const { result } = builderWith([stored("Töö tempo")], {
            locale: "ru"
        });

        expect(result.current.keys.policy).toBe("freeze");
    });
});

describe("keys retired during the session", () => {
    it("are not handed to the next question added", () => {
        // The page's snapshot was taken before this delete, so the tombstone
        // the save is about to create is invisible to it.
        const doomed = stored("Uus küsimus");
        const { result } = builderWith([doomed]);

        act(() => {
            result.current.remove(doomed.id);
        });

        expect(result.current.keys.reserved).toContain(doomed.key);
        const next = createElement(
            "nps",
            defaults,
            result.current.stored,
            result.current.keys
        );
        expect(next.key).not.toBe(doomed.key);
    });

    it("keeps what the page already reserved", () => {
        const { result } = builderWith([], {
            keys: { policy: "freeze", reserved: ["linn"] }
        });

        expect(result.current.keys).toEqual({
            policy: "freeze",
            reserved: ["linn"]
        });
    });

    it("does not retire a key merely because an element was retitled", () => {
        // Under `derive` the key tracks the title, so it moves constantly.
        // Reserving every value it passes through would make backspacing a
        // title mint `uus_kusimus_2`.
        const element = stored("Uus küsimus");
        const { result } = builderWith([element]);

        act(() => {
            const edited: SurveyElement = {
                ...result.current.elements[0]!,
                title: "Kui rahul oled?",
                key: "kui_rahul_oled"
            };
            result.current.replace(edited);
        });

        expect(result.current.keys.reserved).toEqual([]);
    });
});
