import { DEFAULT_LOCALE, UI_LOCALES } from "@/lib/i18n/locales";

/**
 * Every path the application knows about, in one place. The proxy protects by
 * *deny by default*: a new owner route is protected the moment it exists, and
 * making something public is a deliberate edit to `PUBLIC_PREFIXES` or, for
 * the landing page's three addresses, to `PUBLIC_EXACT`.
 */
export const ROUTES = {
    /** The landing page, in Estonian. See docs/DECISIONS.md 038. */
    home: "/",
    /**
     * The landing page in one of the other languages it is offered in.
     * Estonian is the bare `/` and has no segment of its own, exactly as the
     * runner's own language is the bare `/k/<slug>`.
     */
    homeInLocale: (locale: string) => `/${locale}`,
    surveys: "/surveys",
    /** The builder for one survey; the survey's own page for now. */
    builder: (surveyId: string) => `/surveys/${surveyId}`,
    /** Charts, individual responses and the drop-off funnel. */
    results: (surveyId: string) => `/surveys/${surveyId}/results`,
    /**
     * One recurring survey's saved comparisons. Keyed on the wave group rather
     * than on a survey: the series outlives any one of its waves, and naming a
     * wave here would make the link break the year it is deleted.
     */
    compare: (waveGroupId: string) => `/waves/${waveGroupId}`,
    /** One saved comparison, drawn. See docs/DECISIONS.md 035. */
    comparison: (comparisonId: string) => `/comparisons/${comparisonId}`,
    /**
     * The matching editor for one comparison. `unmatched` opens it filtered to
     * the questions no row holds yet.
     */
    comparisonMatches: (comparisonId: string, unmatched = false) =>
        `/comparisons/${comparisonId}/matches${unmatched ? "?show=unmatched" : ""}`,
    settings: "/settings",
    login: "/login",
    authCallback: "/auth/callback",
    /**
     * The respondent runner; `k` for *küsitlus*. See docs/DECISIONS.md 011.
     *
     * This is the share link, and it carries no language: it renders the one
     * the survey is written in, which keeps the URL an owner hands out stable
     * whatever they translate it into afterwards.
     */
    runner: (slug: string) => `/k/${slug}`,
    /**
     * The same survey read in one of the other languages it is offered in —
     * what the respondent's picker links to. The survey's own language has no
     * segment: it is `runner()` above. See docs/DECISIONS.md 033.
     */
    runnerInLocale: (slug: string, locale: string) => `/k/${slug}/${locale}`,
    /** The runner's analytics beacon. A Route Handler, not a Server Action. */
    events: "/api/events",
    /**
     * The owner's CSV download. A Route Handler because the browser navigates
     * to it, and deliberately *not* under a public prefix.
     */
    export: (surveyId: string) => `/api/surveys/${surveyId}/export`
} as const;

/**
 * Prefixes reachable without a session. `/k` is the runner: strangers arrive
 * there from a shared link and must never be bounced to a sign-in page, and
 * their analytics beacons must not be answered with a redirect to one either.
 *
 * Listed one endpoint at a time rather than as `/api`: the CSV download that
 * lands there in Phase 8 is the owner's, and a whole-prefix exemption would
 * quietly make it public the moment it exists.
 */
const PUBLIC_PREFIXES = ["/login", "/auth", "/k", ROUTES.events] as const;

/**
 * Public paths that are matched *whole*, never as prefixes — the landing page
 * and its two translations (docs/DECISIONS.md 038).
 *
 * They are a separate list for one reason worth stating plainly: `/` cannot go
 * in `PUBLIC_PREFIXES`. Every path in this application starts with it, so a
 * prefix match on `/` would make the entire owner app public in a single
 * edit, and it would do it silently — the proxy would simply stop redirecting
 * and every page would be left relying on its own `requireSessionUser()`.
 * Deny-by-default is worth more than the one line this saves.
 */
const PUBLIC_EXACT: readonly string[] = [
    ROUTES.home,
    // Every language, Estonian included. `/et` is not an address the page
    // serves — Estonian is the bare `/` — but the *page* is what redirects it
    // there, and it can only do that if the proxy lets the request reach it.
    // Leaving it out would bounce an anonymous visitor to a sign-in form for
    // the crime of typing a valid language code.
    ...UI_LOCALES.map(ROUTES.homeInLocale)
];

export function isPublicPath(pathname: string): boolean {
    if (PUBLIC_EXACT.includes(pathname)) return true;
    return PUBLIC_PREFIXES.some(
        prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

/** `/api/surveys/<id>/export`, the one owner endpoint a browser navigates to. */
const EXPORT_PATH = /^\/api\/surveys\/([^/]+)\/export$/;

/**
 * Sign-in carries the originally requested path through the email round trip,
 * so it arrives back as attacker-controllable input on a public endpoint. Only
 * same-origin absolute paths survive: `//evil.com` and `https://evil.com` are
 * both rejected, and so is anything that is not an owner route.
 *
 * Route handlers are excluded on top of that, because they are not pages. An
 * owner whose session had expired on the CSV download used to sign in and be
 * handed a file instead of a screen — the browser would download it and leave
 * them looking at whatever page they came from. The export is sent to its
 * survey's results page instead, which is where the download button is; every
 * other `/api` path falls back to the survey list.
 */
export function safeReturnPath(candidate: string | null | undefined): string {
    if (typeof candidate !== "string") return ROUTES.surveys;
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
        return ROUTES.surveys;
    }
    if (isPublicPath(candidate)) return ROUTES.surveys;

    const surveyId = EXPORT_PATH.exec(candidate)?.[1];
    if (surveyId !== undefined) return ROUTES.results(surveyId);
    if (candidate === "/api" || candidate.startsWith("/api/")) {
        return ROUTES.surveys;
    }

    return candidate;
}
