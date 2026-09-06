import { describe, expect, it } from "vitest";

import {
    MAX_SLUG_BASE_LENGTH,
    proposeSlug,
    randomSlugToken,
    slugifyTitle
} from "@/domain/slug";
import { SurveySlugSchema } from "@/domain/survey";

describe("slugifyTitle", () => {
    it("lowercases and hyphenates ordinary words", () => {
        expect(slugifyTitle("Employer Brand Survey")).toBe(
            "employer-brand-survey"
        );
    });

    it("folds Estonian diacritics to their base letters", () => {
        expect(slugifyTitle("Tööandja maine üleüldiselt")).toBe(
            "tooandja-maine-uleuldiselt"
        );
        expect(slugifyTitle("Õppejõudude hinnang")).toBe("oppejoudude-hinnang");
        expect(slugifyTitle("Šokolaad ja žanr")).toBe("sokolaad-ja-zanr");
    });

    it("transliterates Cyrillic rather than dropping it", () => {
        expect(slugifyTitle("Опрос сотрудников")).toBe("opros-sotrudnikov");
        expect(slugifyTitle("Ёж и щука")).toBe("ezh-i-shchuka");
    });

    it("collapses punctuation and runs of separators to single hyphens", () => {
        expect(slugifyTitle("  Pulss — oktoober / 2026!  ")).toBe(
            "pulss-oktoober-2026"
        );
    });

    it("truncates at a word boundary rather than mid-word", () => {
        const slug = slugifyTitle(`${"pikk ".repeat(30)}saba`);
        expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_BASE_LENGTH);
        expect(slug.endsWith("-")).toBe(false);
        expect(slug.split("-").at(-1)).toBe("pikk");
    });

    it("returns an empty string when nothing usable survives", () => {
        expect(slugifyTitle("🎉 !!! 🎉")).toBe("");
        expect(slugifyTitle("   ")).toBe("");
    });
});

describe("randomSlugToken", () => {
    it("is always a valid slug on its own", () => {
        for (let i = 0; i < 200; i++) {
            expect(SurveySlugSchema.safeParse(randomSlugToken()).success).toBe(
                true
            );
        }
    });

    it("avoids visually confusable characters", () => {
        const tokens = Array.from({ length: 200 }, () => randomSlugToken(12));
        expect(tokens.join("")).not.toMatch(/[01lio]/);
    });

    it("does not repeat itself", () => {
        const tokens = new Set(
            Array.from({ length: 500 }, () => randomSlugToken())
        );
        expect(tokens.size).toBe(500);
    });
});

describe("proposeSlug", () => {
    const titles = [
        "Tööandja maine uuring",
        "Опрос сотрудников",
        "🎉 !!! 🎉",
        "ab",
        "  ",
        `${"pikk ".repeat(30)}saba`,
        "2026"
    ];

    it("always produces something the schema accepts", () => {
        for (const title of titles) {
            for (let attempt = 0; attempt < 4; attempt++) {
                const slug = proposeSlug(title, attempt);
                expect(
                    SurveySlugSchema.safeParse(slug),
                    `${title} @ ${attempt} → ${slug}`
                ).toMatchObject({ success: true });
            }
        }
    });

    it("uses the bare title slug on the first attempt", () => {
        expect(proposeSlug("Tööandja maine uuring", 0)).toBe(
            "tooandja-maine-uuring"
        );
    });

    it("appends a distinguishing suffix on later attempts", () => {
        const second = proposeSlug("Tööandja maine uuring", 1);
        const third = proposeSlug("Tööandja maine uuring", 2);

        expect(second).toMatch(/^tooandja-maine-uuring-[a-z0-9]+$/);
        expect(third).toMatch(/^tooandja-maine-uuring-[a-z0-9]+$/);
        expect(second).not.toBe(third);
    });

    it("falls back to a token when the title yields too little", () => {
        // Under three characters is below the schema's floor, so the title is
        // abandoned rather than padded into something meaningless.
        expect(proposeSlug("ab", 0)).toMatch(/^[a-z0-9]+$/);
        expect(proposeSlug("ab", 0)).not.toBe("ab");
        expect(proposeSlug("🎉", 0)).toMatch(/^[a-z0-9]+$/);
    });
});
