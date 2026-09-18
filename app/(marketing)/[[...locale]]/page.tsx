import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Ask, type AskQuestion } from "@/components/marketing/ask";
import { Close } from "@/components/marketing/close";
import { Footer } from "@/components/marketing/footer";
import { Languages } from "@/components/marketing/languages";
import { Rail } from "@/components/marketing/rail";
import { Scale } from "@/components/marketing/scale";
import { Waves } from "@/components/marketing/waves";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
    getMarketingTranslations,
    landingLocale,
    readLandingSegment
} from "@/lib/i18n/marketing";
import { loadDemoQuestion } from "@/lib/marketing/demo";
import { ROUTES } from "@/lib/routes";

/**
 * The landing page (docs/DECISIONS.md 038). Three addresses, one file: `/` is
 * Estonian and the one people type, `/en` and `/ru` are the others.
 *
 * Nothing here reads the request, no cookie, no `Accept-Language`, for the
 * reason 011 and 033 give for the runner and which applies twice over to the
 * most-cached document on the site.
 */

type LandingParams = PageProps<"/[[...locale]]">["params"];

/**
 * The share link shown in the languages section when no demo survey is
 * configured. A path rather than an address: the site's own domain is a
 * deployment fact this page does not know, and a made-up one would be the
 * first invented claim on it.
 */
const SAMPLE_SHARE_LINK = ROUTES.runner("rahulolu-2026");

/**
 * Illustrative counts for the built-in question, so its chart reads as a
 * survey that has been collecting rather than as an empty panel. The plate
 * carries the *demonstration data* tag whenever these are in play, and the
 * copy under the card says the same thing in a sentence.
 *
 * Deliberately a modest number. A baseline in the thousands would make the
 * visitor's own answer invisible, which is the one figure on this plate that
 * is real.
 */
const DEMO_BASELINE = {
    paper: 11,
    online: 19,
    email: 9,
    phone: 6,
    none: 2
} as const;

async function resolve(params: LandingParams) {
    const { locale: segments } = await params;
    const segment = readLandingSegment(segments);
    return { segment, locale: landingLocale(segment) };
}

export async function generateMetadata({
    params
}: PageProps<"/[[...locale]]">): Promise<Metadata> {
    const { locale } = await resolve(params);
    const { t } = await getMarketingTranslations(locale);

    return {
        title: t("Landing.meta.title"),
        description: t("Landing.meta.description"),
        alternates: {
            canonical: ROUTES.home,
            languages: {
                et: ROUTES.home,
                en: ROUTES.homeInLocale("en"),
                ru: ROUTES.homeInLocale("ru")
            }
        }
    };
}

export default async function LandingPage({
    params
}: PageProps<"/[[...locale]]">) {
    const { segment, locale } = await resolve(params);

    // Anything that is not a language this page is offered in is not a page of
    // ours. Without this, every mistyped address in the origin would answer
    // 200 with the landing page on it.
    if (segment === "unknown") notFound();

    // Estonian already lives at `/`, so `/et` is a second URL for one page.
    if (segment === DEFAULT_LOCALE) redirect(ROUTES.home);

    const demo = await loadDemoQuestion(locale);
    const question = demo?.question ?? null;
    const { t } = await getMarketingTranslations(locale);

    const ask: AskQuestion =
        question === null
            ? fallbackQuestion(t)
            : {
                  key: question.key,
                  title: question.title,
                  options: question.options.map(option => ({
                      value: option.value,
                      label: option.label
                  }))
              };

    const demoHref = demo === null ? null : ROUTES.runner(demo.slug);

    return (
        <>
            <a
                href="#ask"
                className="sr-only rounded-lg bg-primary px-3 py-2 text-[13px] text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10"
            >
                {t("Landing.nav.skip")}
            </a>

            <Rail locale={locale} t={t} />

            {/* One continuous surface: the sections are separated by rhythm
                rather than by bands of colour, so the page reads as a single
                sheet of paper from the question to the way in. */}
            <main
                id="ask"
                className="mx-auto flex w-full max-w-[1100px] flex-col gap-24 px-4 pt-14 pb-16 sm:pt-20"
            >
                <Ask question={ask} />
                <Scale t={t} />
                <Waves t={t} />
                <Languages shareLink={demoHref ?? SAMPLE_SHARE_LINK} t={t} />
                <Close demoHref={demoHref} t={t} />
                <Footer locale={locale} t={t} />
            </main>
        </>
    );
}

/**
 * The question the page asks when there is no published demo survey to borrow
 * one from, which is the case in every environment until someone publishes
 * one, this repository's own included.
 *
 * It is a real single-choice question in the product's own shape, not a
 * picture of one: the same component renders it, and the same three plates
 * receive its answer. The only thing it lacks is a survey behind it, which is
 * exactly what the secondary action disappears to say.
 */
function fallbackQuestion(
    t: Awaited<ReturnType<typeof getMarketingTranslations>>["t"]
): AskQuestion {
    return {
        key: "feedback_today",
        title: t("Landing.demo.title"),
        options: [
            { value: "paper", label: t("Landing.demo.options.paper") },
            { value: "online", label: t("Landing.demo.options.online") },
            { value: "email", label: t("Landing.demo.options.email") },
            { value: "phone", label: t("Landing.demo.options.phone") },
            { value: "none", label: t("Landing.demo.options.none") }
        ],
        baseline: DEMO_BASELINE,
        // Three languages on purpose: `responses.locale` is a real column, and
        // this is the trilingual claim shown rather than asserted.
        recent: [
            {
                ago: t("Landing.plates.ago.t1"),
                locale: "ru",
                value: "online"
            },
            {
                ago: t("Landing.plates.ago.t2"),
                locale: "et",
                value: "paper"
            },
            {
                ago: t("Landing.plates.ago.t3"),
                locale: "en",
                value: "email"
            }
        ]
    };
}
