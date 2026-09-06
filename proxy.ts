import type { NextRequest } from "next/server";

import { ROUTES, isPublicPath } from "@/lib/routes";
import { redirectWithSession, refreshSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed middleware to `proxy` (docs/DECISIONS.md 006). Node
 * runtime only, and not configurable.
 *
 * Two jobs: refresh the Supabase session so access tokens keep rotating, and
 * make an *optimistic* access decision. Optimistic is the operative word — the
 * Next.js docs are explicit that a proxy is not an authorisation layer, so
 * every owner page still calls `requireUser()` and every Server Action
 * re-checks for itself.
 */
export async function proxy(request: NextRequest) {
    const { response, userId } = await refreshSession(request);
    const { pathname } = request.nextUrl;

    if (userId === null && !isPublicPath(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = ROUTES.login;
        url.search = "";
        if (pathname !== ROUTES.home) url.searchParams.set("next", pathname);
        return redirectWithSession(url, response);
    }

    if (userId !== null && pathname === ROUTES.login) {
        const url = request.nextUrl.clone();
        url.pathname = ROUTES.surveys;
        url.search = "";
        return redirectWithSession(url, response);
    }

    return response;
}

export const config = {
    /*
     * Everything except Next's own assets and files with an extension. The
     * runner (`/k/...`) is matched deliberately: it is public, so it falls
     * straight through, but its session still refreshes if the visitor happens
     * to be a signed-in owner previewing their own survey.
     */
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)"
    ]
};
