import "server-only";

import { cache } from "react";

import type { SingleChoiceQuestion } from "@/domain/question";
import type { UiLocale } from "@/lib/i18n/locales";
import { loadRunnerSurvey } from "@/lib/runner/load";

/**
 * The landing page's demonstration question.
 *
 * The page's whole argument is that the visitor is answering a real thing, so
 * the question is read from a real published survey through the runner's own
 * loader, the same `get_runner_survey` path a respondent goes down, in the
 * language the page is being read in. Nothing here is a second way to read a
 * survey.
 *
 * **It is deliberately optional.** The production demo survey does not exist
 * yet, a survey can be closed, and its author can reword or reorder it without
 * knowing that a marketing page is reading it. Any of those would otherwise
 * turn the front page of the site into a 500, which is a far worse failure
 * than showing the built-in question below. So the loader answers `null` for
 * every one of them and the page falls back.
 */

/** Which published survey the landing page borrows its question from. */
const DEMO_SLUG = process.env["NEXT_PUBLIC_DEMO_SURVEY_SLUG"];

export type DemoQuestion = {
    /** The question and its options, resolved into one language. */
    readonly question: SingleChoiceQuestion;
    /** The slug to link to, so a visitor can answer the whole thing for real. */
    readonly slug: string;
};

/**
 * The first single-choice question of the demo survey, or `null`.
 *
 * Single choice specifically: the hero is one tap that has to resolve into one
 * bar, and a matrix or a long-text box in that position would be a different
 * page. A demo survey whose first answerable element is neither is a
 * configuration mistake, and it fails the same quiet way as a missing one.
 */
export const loadDemoQuestion = cache(
    async (locale: UiLocale): Promise<DemoQuestion | null> => {
        if (DEMO_SLUG === undefined || DEMO_SLUG === "") return null;

        const found = await loadRunnerSurvey(DEMO_SLUG, locale);
        if (found === null || found.survey.status !== "published") return null;

        const question = found.survey.elements.find(
            (element): element is SingleChoiceQuestion =>
                element.type === "single_choice"
        );
        if (question === undefined) return null;

        return { question, slug: DEMO_SLUG };
    }
);
