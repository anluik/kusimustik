import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunnerNotice } from "@/components/runner/runner-notice";
import { MESSAGES, renderWithIntl } from "@/components/test-support";

/**
 * The respondent's last screen. It is the only one with nothing else on it, so
 * a card that says "thank you" and names nothing reads as a page that failed
 * to load rather than as an answered survey.
 */

const copy = MESSAGES.runner;

describe("RunnerNotice", () => {
    it("names the survey the respondent just answered", () => {
        renderWithIntl(<RunnerNotice kind="thanks" surveyTitle="Maine 2026" />);

        expect(screen.getByText("Maine 2026")).not.toBeNull();
        expect(screen.getByText(copy.RunnerThanks.title)).not.toBeNull();
    });

    it("names the survey that has stopped collecting", () => {
        renderWithIntl(<RunnerNotice kind="closed" surveyTitle="Maine 2026" />);

        expect(screen.getByText("Maine 2026")).not.toBeNull();
        expect(screen.getByText(copy.RunnerClosed.title)).not.toBeNull();
    });

    it("names nothing when the link matched nothing", () => {
        // There is no survey to name, and a heading with an empty line above
        // it would be worse than none.
        const { container } = renderWithIntl(<RunnerNotice kind="notFound" />);

        expect(screen.getByText(copy.RunnerNotFound.title)).not.toBeNull();
        expect(container.querySelectorAll("p")).toHaveLength(1);
    });
});
