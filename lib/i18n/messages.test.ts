import { describe, expect, it } from "vitest";

import { LOCALES } from "@/domain/survey";
import appEt from "@/messages/app/et.json";
import appEn from "@/messages/app/en.json";
import appRu from "@/messages/app/ru.json";
import runnerEt from "@/messages/runner/et.json";
import runnerEn from "@/messages/runner/en.json";
import runnerRu from "@/messages/runner/ru.json";
import marketingEt from "@/messages/marketing/et.json";
import marketingEn from "@/messages/marketing/en.json";
import marketingRu from "@/messages/marketing/ru.json";
import { UI_LOCALES } from "@/lib/i18n/locales";
import { RUNNER_ACTION_ERRORS } from "@/lib/runner/errors";

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
    runner: { et: runnerEt, en: runnerEn, ru: runnerRu },
    marketing: { et: marketingEt, en: marketingEn, ru: marketingRu }
} as const;

describe("UI locales", () => {
    it("are exactly the locales a survey can be written in", () => {
        // `lib/i18n/locales.ts` restates the list so client components do not
        // pull `domain/` into the browser bundle; `satisfies` only proves the
        // subset direction, so the equality is asserted here.
        expect([...UI_LOCALES].sort()).toEqual([...LOCALES].sort());
    });
});

describe.each(["app", "runner", "marketing"] as const)(
    "%s catalogue",
    surface => {
        const reference = keyPaths(CATALOGUES[surface].et).sort();

        it("is not empty", () => {
            expect(reference.length).toBeGreaterThan(0);
        });

        it.each(UI_LOCALES)("has exactly the Estonian keys in %s", locale => {
            // Estonian is the source of truth: a key missing from et is not a key,
            // and a key only present in en or ru renders as its own path.
            expect(keyPaths(CATALOGUES[surface][locale]).sort()).toEqual(
                reference
            );
        });

        it.each(UI_LOCALES)("has no blank messages in %s", locale => {
            const blanks = Object.entries(
                flatten(CATALOGUES[surface][locale])
            ).filter(([, message]) => message.trim() === "");
            expect(blanks).toEqual([]);
        });
    }
);

describe("catalogue split", () => {
    it.each([
        ["app", "runner", appEt, runnerEt],
        ["app", "marketing", appEt, marketingEt],
        ["runner", "marketing", runnerEt, marketingEt]
    ] as const)(
        "shares no top-level namespace between %s and %s",
        (_left, _right, left, right) => {
            // The three are intersected into one global `Messages` type
            // (lib/i18n/next-intl.d.ts). Pairwise-disjoint namespaces are what
            // keeps that intersection lossless and keeps one surface's key from
            // shadowing another's — see docs/DECISIONS.md 011 and 038.
            const names = new Set(Object.keys(left));
            const overlap = Object.keys(right).filter(name => names.has(name));
            expect(overlap).toEqual([]);
        }
    );

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

    it("has copy for every code a submission can fail with", () => {
        // `RunnerErrors.*` is the one namespace whose keys are a TypeScript
        // union somewhere else: `submitResponseAction` returns a code and the
        // runner renders `errors(code)`, so a code added without its copy
        // renders as its own path on a respondent's phone. Phase 9 added two.
        const copy = Object.keys(
            (runnerEt as Catalogue)["RunnerErrors"] as Catalogue
        );
        expect(copy).toEqual(expect.arrayContaining([...RUNNER_ACTION_ERRORS]));
    });

    it("keeps owner-only copy out of the runner catalogue", () => {
        const runnerKeys = keyPaths(runnerEt).join(" ");
        expect(runnerKeys).not.toMatch(/Surveys|Settings|Auth|Nav/);
    });

    it("keeps owner and runner copy out of the marketing catalogue", () => {
        // The landing page is loaded by more strangers than any other surface
        // and by ones who have not decided to be here yet, so it ships its own
        // copy and nobody else's (docs/DECISIONS.md 038).
        const marketingKeys = keyPaths(marketingEt).join(" ");
        expect(marketingKeys).not.toMatch(
            /Surveys|Settings|Builder|Results|Waves|Runner/
        );
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
