import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RunnerNotice } from "@/components/runner/runner-notice";
import { RunnerScreen } from "@/components/runner/runner-screen";
import { isAnswerableElement } from "@/domain/question";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
    getRunnerTranslations,
    readLocaleSegment,
    requestedLocale
} from "@/lib/i18n/runner";
import { ROUTES } from "@/lib/routes";
import { loadRunnerSurvey } from "@/lib/runner/load";

/**
 * The respondent runner (docs/PLAN.md Phase 6). Server-rendered, no auth, and
 * reached only by knowing the slug — `surveys` has no anonymous SELECT policy,
 * so the definition arrives through `get_runner_survey` (DECISIONS 009, 016).
 *
 * The read carries no session and touches no cookies, which is what keeps this
 * request cacheable in principle. Phase 12 step 3 added the language without
 * giving that up: it is a path segment, so each language is its own URL and
 * nothing here has to look at the request (DECISIONS 011, 033).
 */

type RunnerParams = PageProps<"/k/[slug]/[[...locale]]">["params"];

/** The slug, what the URL asked for, and what the database had to say. */
async function resolveRequest(params: RunnerParams) {
    const { slug, locale: segments } = await params;
    const segment = readLocaleSegment(segments);
    const found = await loadRunnerSurvey(slug, requestedLocale(segment));
    return { slug, segment, found };
}

export async function generateMetadata({
    params
}: PageProps<"/k/[slug]/[[...locale]]">): Promise<Metadata> {
    const { found } = await resolveRequest(params);

    // A survey link is unlisted rather than secret, and indexing it would make
    // it neither: search traffic answering a questionnaire is noise in someone
    // else's data. It is also what keeps one survey's several language URLs
    // from competing with each other as duplicates.
    const robots = { index: false, follow: false };

    if (found === null) {
        const { t } = await getRunnerTranslations(DEFAULT_LOCALE);
        return { title: t("RunnerNotFound.title"), robots };
    }

    // The survey's own name and description are untranslated columns — they
    // name it in the owner's list and in their tab, and the document is what a
    // respondent reads (docs/DECISIONS.md 030).
    return {
        title: found.survey.title,
        ...(found.survey.description !== undefined && {
            description: found.survey.description
        }),
        robots
    };
}

export default async function RunnerPage({
    params
}: PageProps<"/k/[slug]/[[...locale]]">) {
    const { slug, segment, found } = await resolveRequest(params);

    // A segment that names no language at all is not a page of ours.
    if (segment === "unknown") notFound();
    if (found === null) notFound();

    // A well-formed language this survey is not offered in: a link from before
    // the author dropped it, or one typed by hand. The respondent is sent to
    // the survey's own language rather than refused — they came here to answer
    // it, and the language they asked for is the part that no longer exists.
    if (segment !== undefined && found.locale !== segment) {
        redirect(ROUTES.runner(slug));
    }

    if (found.survey.status !== "published") {
        return <RunnerNotice kind="closed" surveyTitle={found.survey.title} />;
    }

    // Publishing refuses a survey with nothing to answer, but the questions
    // can leave afterwards: deleting the last one from a live survey used to
    // leave the link serving a blank page with a working submit button, which
    // filed empty responses and counted them. `submitResponseAction` refuses
    // the same case, since a Server Action is reachable without this page.
    if (!found.survey.elements.some(isAnswerableElement)) {
        return <RunnerNotice kind="empty" surveyTitle={found.survey.title} />;
    }

    return (
        <RunnerScreen
            survey={found.survey}
            locale={found.locale}
            version={found.publishedVersion}
        />
    );
}
