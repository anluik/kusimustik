import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguagePicker } from "@/components/runner/language-picker";
import { MESSAGES, renderWithIntl } from "@/components/test-support";

/**
 * The respondent's language picker (docs/DECISIONS.md 033).
 *
 * What is worth pinning here is the URLs, because they are the whole design:
 * each language is a page rather than a preference, and the language the
 * survey is written in is the share link itself — so a respondent who switches
 * back lands on the URL the owner handed out rather than on a second spelling
 * of it.
 */

const names = MESSAGES.runner.RunnerLanguage.name;

function href(name: string): string | null {
    return screen.getByRole("link", { name }).getAttribute("href");
}

describe("LanguagePicker", () => {
    it("renders nothing for a survey offered in one language", () => {
        const { container } = renderWithIntl(
            <LanguagePicker
                slug="maine26"
                active="et"
                source="et"
                locales={["et"]}
            />
        );

        expect(container.innerHTML).toBe("");
    });

    it("sends the survey's own language to the share link, and the others to a segment", () => {
        renderWithIntl(
            <LanguagePicker
                slug="maine26"
                active="et"
                source="et"
                locales={["et", "en", "ru"]}
            />
        );

        expect(href(names.et)).toBe("/k/maine26");
        expect(href(names.en)).toBe("/k/maine26/en");
        expect(href(names.ru)).toBe("/k/maine26/ru");
    });

    it("marks the language being read, which is not always the survey's own", () => {
        renderWithIntl(
            <LanguagePicker
                slug="maine26"
                active="ru"
                source="et"
                locales={["et", "ru"]}
            />
        );

        expect(
            screen
                .getByRole("link", { name: names.ru })
                .getAttribute("aria-current")
        ).toBe("page");
        expect(
            screen
                .getByRole("link", { name: names.et })
                .getAttribute("aria-current")
        ).toBeNull();
    });

    it("names every language in itself, so it is legible to the person who needs it", () => {
        renderWithIntl(
            <LanguagePicker
                slug="maine26"
                active="et"
                source="et"
                locales={["et", "en", "ru"]}
            />
        );

        // Endonyms: the Russian entry says "Русский" on a page rendered in
        // Estonian, which is the only thing a Russian speaker can recognise.
        expect(names.ru).toBe("Русский");
        expect(screen.getByRole("link", { name: "Русский" })).not.toBeNull();
    });
});
