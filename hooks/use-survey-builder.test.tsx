import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SurveyLocale } from "@/domain/content";
import { newSurveyId } from "@/domain/ids";
import { authorElement } from "@/domain/localize";
import type { AuthoredElement } from "@/domain/question";
import { createElement } from "@/lib/builder/new-element";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";

/**
 * The autosave's gate — what it refuses to send — and the seam between the
 * stored document and the one language of it the editor panel sees.
 *
 * The gate exists because a save that goes out and fails is not recoverable
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

/** One language of a question, as the editor panel hands one back. */
const question = (title: string, siblings: readonly AuthoredElement[] = []) =>
    createElement("nps", { ...defaults, title }, siblings);

/** The same, as the document holds it: Estonian and nothing else. */
const stored = (title: string, siblings: readonly AuthoredElement[] = []) =>
    authorElement(question(title, siblings), "et");

/** A survey written in Estonian and translated into nothing. */
const HEAD_FIXTURE = { title: { et: "Maine ja rahulolu" } };

function builderWith(
    initialElements: readonly AuthoredElement[],
    { locale = "et" }: { readonly locale?: SurveyLocale } = {}
) {
    return renderHook(() =>
        useSurveyBuilder({
            surveyId: SURVEY_ID,
            initialHead: HEAD_FIXTURE,
            initialElements,
            initialVersion: 1,
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

    it("never moves a question's key when it is retitled", async () => {
        // Keys are internal lineage, not a slug of the title (DECISIONS 035).
        const element = stored("Töö tempo");
        const { result } = builderWith([element]);

        act(() => {
            result.current.replace({
                ...result.current.elements[0]!,
                title: "Kui rahul oled?"
            });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(saved()[0]?.key).toBe(element.key);
    });
});
