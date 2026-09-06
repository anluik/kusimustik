import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/db/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";

/**
 * Refreshes the Supabase session for one request and returns the response the
 * rotated cookies were written to. Server Components cannot write cookies, so
 * without this the access token would expire and never renew.
 *
 * The returned response must be the one that reaches the browser — including
 * on a redirect, where its cookies have to be copied across.
 */
export async function refreshSession(request: NextRequest): Promise<{
    readonly response: NextResponse;
    readonly userId: string | null;
}> {
    let response = NextResponse.next({ request });

    const db = createServerClient<Database>(
        supabaseUrl(),
        supabasePublishableKey(),
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll(cookiesToSet) {
                    for (const { name, value } of cookiesToSet) {
                        request.cookies.set(name, value);
                    }
                    response = NextResponse.next({ request });
                    for (const { name, value, options } of cookiesToSet) {
                        response.cookies.set(name, value, options);
                    }
                }
            }
        }
    );

    // getUser(), not getSession(): only the former revalidates the JWT against
    // the auth server, and this decides whether a request is let through.
    const { data } = await db.auth.getUser();

    return { response, userId: data.user?.id ?? null };
}

/** Carries the refreshed auth cookies onto a redirect. */
export function redirectWithSession(
    url: URL,
    session: NextResponse
): NextResponse {
    const redirect = NextResponse.redirect(url);
    for (const cookie of session.cookies.getAll()) {
        redirect.cookies.set(cookie);
    }
    return redirect;
}
