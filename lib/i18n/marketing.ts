import { createTranslator, hasLocale } from "next-intl";

import {
    APP_TIME_ZONE,
    DEFAULT_LOCALE,
    UI_LOCALES,
    type UiLocale
} from "@/lib/i18n/locales";
import {
    loadMarketingMessages,
    type MarketingMessages
} from "@/lib/i18n/messages";

/**
 * The landing page's translator, as its server components receive it.
 *
 * They are handed this rather than calling `getTranslations()` themselves, and
 * the difference is not stylistic: `next-intl/server`'s own getters resolve
 * through `lib/i18n/request.ts`, which loads the *owner app's* catalogue from
 * the locale cookie. A marketing key looked up that way does not fail, it
 * renders as its own path, which is how `Landing.scale.title` ends up on the
 * page looking like a string somebody forgot to translate.
 */
export type MarketingTranslator = Awaited<
    ReturnType<typeof getMarketingTranslations>
>["t"];

/**
 * The landing page's translations. Locale is a parameter and never a cookie,
 * for the same reason the runner's is not (docs/DECISIONS.md 011 and 033): `/`
 * is a public route, and reading the request would make every visit dynamic
 * and hand two people the same URL for different pages. Here it also costs the
 * one thing a marketing page most wants, a static, cacheable document and a
 * language a link can actually point at.
 *
 * Estonian is the market and therefore the bare `/`; the other two are `/en`
 * and `/ru`. See docs/DECISIONS.md 038.
 */
export async function getMarketingTranslations(locale: UiLocale) {
    const messages = await loadMarketingMessages(locale);
    return {
        locale,
        messages,
        timeZone: APP_TIME_ZONE,
        t: createTranslator<MarketingMessages>({
            locale,
            messages,
            timeZone: APP_TIME_ZONE
        })
    };
}

/**
 * What the landing page's `[[...locale]]` segment asks for.
 *
 * `undefined` is the bare `/`, the address people type and the one printed on
 * things, which renders Estonian. `"unknown"` is anything else: `/pricing`,
 * `/en/extra`, a stale link. Nothing can render those, and the page turns them
 * into a 404 rather than quietly serving the landing page at every address in
 * the origin, which would make every typo look like a real page and give the
 * same content an unbounded number of URLs.
 */
export type LandingLocaleSegment = UiLocale | "unknown" | undefined;

export function readLandingSegment(
    segments: readonly string[] | undefined
): LandingLocaleSegment {
    if (segments === undefined || segments.length === 0) return undefined;
    if (segments.length > 1) return "unknown";
    const [only] = segments;
    return only !== undefined && hasLocale(UI_LOCALES, only) ? only : "unknown";
}

/**
 * The language to render, given a segment.
 *
 * Estonian has no segment of its own: `/` is already its address, so the page
 * redirects `/et` there rather than serving one language at two URLs. This
 * function still resolves `"et"`, the redirect is the page's job, and a
 * resolver that threw here would make the redirect harder to write, not safer.
 */
export function landingLocale(segment: LandingLocaleSegment): UiLocale {
    return segment === undefined || segment === "unknown"
        ? DEFAULT_LOCALE
        : segment;
}
