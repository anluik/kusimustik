/**
 * Every path the application knows about, in one place. The proxy protects by
 * *deny by default*: a new owner route is protected the moment it exists, and
 * making something public is a deliberate edit to `PUBLIC_PREFIXES`.
 */
export const ROUTES = {
    home: "/",
    surveys: "/surveys",
    /** The builder for one survey; the survey's own page for now. */
    builder: (surveyId: string) => `/surveys/${surveyId}`,
    settings: "/settings",
    login: "/login",
    authCallback: "/auth/callback",
    /** The respondent runner; `k` for *küsitlus*. See docs/DECISIONS.md 011. */
    runner: (slug: string) => `/k/${slug}`,
    /** The runner's analytics beacon. A Route Handler, not a Server Action. */
    events: "/api/events"
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

export function isPublicPath(pathname: string): boolean {
    return PUBLIC_PREFIXES.some(
        prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

/**
 * Sign-in carries the originally requested path through the email round trip,
 * so it arrives back as attacker-controllable input on a public endpoint. Only
 * same-origin absolute paths survive: `//evil.com` and `https://evil.com` are
 * both rejected, and so is anything that is not an owner route.
 */
export function safeReturnPath(candidate: string | null | undefined): string {
    if (typeof candidate !== "string") return ROUTES.surveys;
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
        return ROUTES.surveys;
    }
    if (isPublicPath(candidate)) return ROUTES.surveys;
    return candidate;
}
