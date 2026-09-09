import { describe, expect, it } from "vitest";

import { readLocaleSegment, requestedLocale } from "@/lib/i18n/runner";

/**
 * The `/k/[slug]/[[...locale]]` segment (docs/DECISIONS.md 033).
 *
 * It is the one piece of the respondent's language that is a *string from the
 * internet*, so it is parsed rather than trusted: the survey it names decides
 * whether the language is on offer, and this decides only whether the URL
 * names a language at all.
 */
describe("readLocaleSegment", () => {
    it("reads the share link, which names no language", () => {
        expect(readLocaleSegment(undefined)).toBeUndefined();
        expect(readLocaleSegment([])).toBeUndefined();
    });

    it("reads each of the product's languages", () => {
        expect(readLocaleSegment(["et"])).toBe("et");
        expect(readLocaleSegment(["en"])).toBe("en");
        expect(readLocaleSegment(["ru"])).toBe("ru");
    });

    it("refuses a segment that names no language", () => {
        expect(readLocaleSegment(["fi"])).toBe("unknown");
        expect(readLocaleSegment(["EN"])).toBe("unknown");
        expect(readLocaleSegment([""])).toBe("unknown");
        expect(readLocaleSegment(["../../etc/passwd"])).toBe("unknown");
    });

    it("refuses a deeper path: there is no page under a language", () => {
        expect(readLocaleSegment(["et", "extra"])).toBe("unknown");
        expect(readLocaleSegment(["et", "en"])).toBe("unknown");
    });
});

describe("requestedLocale", () => {
    it("asks the database for nothing in particular when the URL did not", () => {
        expect(requestedLocale(undefined)).toBeUndefined();
        expect(requestedLocale("unknown")).toBeUndefined();
    });

    it("passes a language through", () => {
        expect(requestedLocale("ru")).toBe("ru");
    });
});
