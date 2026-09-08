import { describe, expect, it } from "vitest";

import { LOCALES } from "@/domain/survey";
import appEt from "@/messages/app/et.json";
import appEn from "@/messages/app/en.json";
import appRu from "@/messages/app/ru.json";
import runnerEt from "@/messages/runner/et.json";
import runnerEn from "@/messages/runner/en.json";
import runnerRu from "@/messages/runner/ru.json";
import { UI_LOCALES } from "@/lib/i18n/locales";

type Catalogue = Record<string, unknown>;

/** Every leaf, as `Namespace.section.key`. */
function keyPaths(value: unknown, prefix = ""): string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [prefix];
    }
    return Object.entries(value as Catalogue).flatMap(([key, child]) =>
        keyPaths(child, prefix === "" ? key : `${prefix}.${key}`)
    );
}

const CATALOGUES = {
    app: { et: appEt, en: appEn, ru: appRu },
    runner: { et: runnerEt, en: runnerEn, ru: runnerRu }
} as const;

describe("UI locales", () => {
    it("are exactly the locales a survey can be written in", () => {
        // `lib/i18n/locales.ts` restates the list so client components do not
        // pull `domain/` into the browser bundle; `satisfies` only proves the
        // subset direction, so the equality is asserted here.
        expect([...UI_LOCALES].sort()).toEqual([...LOCALES].sort());
    });
});

describe.each(["app", "runner"] as const)("%s catalogue", surface => {
    const reference = keyPaths(CATALOGUES[surface].et).sort();

    it("is not empty", () => {
        expect(reference.length).toBeGreaterThan(0);
    });

    it.each(UI_LOCALES)("has exactly the Estonian keys in %s", locale => {
        // Estonian is the source of truth: a key missing from et is not a key,
        // and a key only present in en or ru renders as its own path.
        expect(keyPaths(CATALOGUES[surface][locale]).sort()).toEqual(reference);
    });

    it.each(UI_LOCALES)("has no blank messages in %s", locale => {
        const blanks = Object.entries(
            flatten(CATALOGUES[surface][locale])
        ).filter(([, message]) => message.trim() === "");
        expect(blanks).toEqual([]);
    });
});

describe("catalogue split", () => {
    it("shares no top-level namespace between app and runner", () => {
        // The two are intersected into one global `Messages` type
        // (lib/i18n/next-intl.d.ts). Disjoint namespaces are what keeps that
        // intersection lossless and keeps a runner key from shadowing an app
        // one — see docs/DECISIONS.md 011.
        const app = new Set(Object.keys(appEt));
        const overlap = Object.keys(runnerEt).filter(name => app.has(name));
        expect(overlap).toEqual([]);
    });

    /**
     * The builder canvas promises, in its own empty state, that it shows "how
     * the respondent sees this". Any respondent-facing wording it draws
     * therefore has to be the runner's wording, and the two catalogues are the
     * one place where that can silently drift — as it did for the NPS
     * endpoints, which read differently in the preview and at the public link.
     * Add a pair here whenever the preview borrows respondent copy.
     */
    const SHARED_RESPONDENT_COPY = [
        ["Builder.preview.npsMinLabel", "RunnerQuestion.npsMinLabel"],
        ["Builder.preview.npsMaxLabel", "RunnerQuestion.npsMaxLabel"],
        [
            "Builder.preview.dropdownPlaceholder",
            "RunnerQuestion.dropdownPlaceholder"
        ],
        ["Builder.canvas.required", "RunnerShell.required"],
        ["Builder.canvas.optional", "RunnerShell.optional"]
    ] as const;

    it.each(UI_LOCALES)(
        "renders the same respondent copy in preview and runner in %s",
        locale => {
            const app = flatten(CATALOGUES.app[locale]);
            const runner = flatten(CATALOGUES.runner[locale]);

            for (const [appKey, runnerKey] of SHARED_RESPONDENT_COPY) {
                expect(
                    { [appKey]: app[appKey] },
                    `${appKey} must read as ${runnerKey}`
                ).toEqual({ [appKey]: runner[runnerKey] });
            }
        }
    );

    it("keeps owner-only copy out of the runner catalogue", () => {
        const runnerKeys = keyPaths(runnerEt).join(" ");
        expect(runnerKeys).not.toMatch(/Surveys|Settings|Auth|Nav/);
    });
});

function flatten(value: unknown, prefix = ""): Record<string, string> {
    if (typeof value === "string") return { [prefix]: value };
    if (typeof value !== "object" || value === null) return {};
    return Object.entries(value as Catalogue).reduce<Record<string, string>>(
        (acc, [key, child]) => ({
            ...acc,
            ...flatten(child, prefix === "" ? key : `${prefix}.${key}`)
        }),
        {}
    );
}
