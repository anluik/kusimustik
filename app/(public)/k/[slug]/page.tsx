import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunnerNotice } from "@/components/runner/runner-notice";
import { RunnerScreen } from "@/components/runner/runner-screen";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getRunnerTranslations } from "@/lib/i18n/runner";
import { loadRunnerSurvey } from "@/lib/runner/load";

/**
 * The respondent runner (docs/PLAN.md Phase 6). Server-rendered, no auth, and
 * reached only by knowing the slug — `surveys` has no anonymous SELECT policy,
 * so the definition arrives through `get_runner_survey` (DECISIONS 009, 016).
 *
 * The read carries no session and touches no cookies, which is what keeps this
 * request cacheable in principle and is the same reason DECISIONS 011 took the
 * locale from `survey.locale` rather than from a cookie.
 */

export async function generateMetadata({
    params
}: PageProps<"/k/[slug]">): Promise<Metadata> {
    const { slug } = await params;
    const found = await loadRunnerSurvey(slug);

    // A survey link is unlisted rather than secret, and indexing it would make
    // it neither: search traffic answering a questionnaire is noise in someone
    // else's data.
    const robots = { index: false, follow: false };

    if (found === null) {
        const { t } = await getRunnerTranslations(DEFAULT_LOCALE);
        return { title: t("RunnerNotFound.title"), robots };
    }

    return {
        title: found.survey.title,
        ...(found.survey.description !== undefined && {
            description: found.survey.description
        }),
        robots
    };
}

export default async function RunnerPage({ params }: PageProps<"/k/[slug]">) {
    const { slug } = await params;
    const found = await loadRunnerSurvey(slug);

    if (found === null) notFound();
    if (found.survey.status !== "published") {
        return <RunnerNotice kind="closed" surveyTitle={found.survey.title} />;
    }

    return (
        <RunnerScreen survey={found.survey} version={found.publishedVersion} />
    );
}
