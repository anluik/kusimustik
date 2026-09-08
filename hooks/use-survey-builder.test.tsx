import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newSurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import type { SurveyKeys } from "@/lib/builder/keys";
import { createElement } from "@/lib/builder/new-element";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";

/**
 * The autosave's two gates: what it refuses to send, and which keys it
 * considers spent.
 *
 * Both exist because a save that goes out and fails is not recoverable from
 * the builder — the document is unchanged, so every retry re-sends it and
 * fails identically. Anything the server or the database would reject has to
 * be caught before the request, not after it.
 */

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surveys/actions", () => ({ saveSurveyElementsAction: save }));

const SURVEY_ID = newSurveyId();

const defaults = {
    title: "Uus küsimus",
    statementTitle: "Uus väide",
    optionLabel: (index: number) => `Valik ${index}`,
    rowLabel: (index: number) => `Rida ${index}`,
    columnLabel: (index: number) => `Veerg ${index}`
};

const KEYS: SurveyKeys = { policy: "derive", reserved: [] };

const question = (title: string, siblings: readonly SurveyElement[] = []) =>
    createElement("nps", { ...defaults, title }, siblings, KEYS);

function builderWith(
    initialElements: readonly SurveyElement[],
    keys: SurveyKeys = KEYS
) {
    return renderHook(() =>
        useSurveyBuilder({
            surveyId: SURVEY_ID,
            initialElements,
            initialVersion: 1,
            keys
        })
    );
}

beforeEach(() => {
    save.mockReset();
    save.mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("the save gate", () => {
    it("holds a document whose questions collide on a key", async () => {
        const first = question("Töö tempo");
        const second = question("Kui rahul oled?", [first]);
        const { result } = builderWith([first, second]);

        act(() => {
            result.current.replace({ ...second, key: first.key });
        });

        expect(result.current.status).toEqual({ kind: "invalid" });
        await new Promise(resolve => setTimeout(resolve, 900));
        expect(save).not.toHaveBeenCalled();
    });

    it("resumes the moment the collision is resolved", async () => {
        const first = question("Töö tempo");
        const second = question("Kui rahul oled?", [first]);
        const { result } = builderWith([first, second]);

        act(() => {
            result.current.replace({ ...second, key: first.key });
        });
        act(() => {
            result.current.replace({ ...second, key: "kui_rahul" });
        });

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });
});

describe("keys retired during the session", () => {
    it("are not handed to the next question added", () => {
        // The page's snapshot was taken before this delete, so the tombstone
        // the save is about to create is invisible to it.
        const doomed = question("Uus küsimus");
        const { result } = builderWith([doomed]);

        act(() => {
            result.current.remove(doomed.id);
        });

        expect(result.current.keys.reserved).toContain(doomed.key);
        const next = createElement(
            "nps",
            defaults,
            result.current.elements,
            result.current.keys
        );
        expect(next.key).not.toBe(doomed.key);
    });

    it("keeps what the page already reserved", () => {
        const { result } = builderWith([], {
            policy: "freeze",
            reserved: ["linn"]
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
        const element = question("Uus küsimus");
        const { result } = builderWith([element]);

        act(() => {
            result.current.replace({
                ...element,
                title: "Kui rahul oled?",
                key: "kui_rahul_oled"
            });
        });

        expect(result.current.keys.reserved).toEqual([]);
    });
});
