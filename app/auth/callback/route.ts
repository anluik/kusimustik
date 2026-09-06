import { NextResponse, type NextRequest } from "next/server";

import type { SignInError } from "@/lib/auth/errors";
import { siteUrl } from "@/lib/env";
import { ROUTES, safeReturnPath } from "@/lib/routes";
import { createServerDb } from "@/lib/supabase/server";

/**
 * Where the magic link lands. `@supabase/ssr` uses PKCE, so the link comes back
 * with a `code` that is exchanged for a session here; the verifier lives in a
 * cookie set when the link was requested, which is why opening the link in a
 * different browser fails and gets its own message.
 *
 * A Route Handler rather than a Server Action because the browser arrives here
 * by GET, from an email client.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const origin = siteUrl();
    const params = request.nextUrl.searchParams;

    const failWith = (error: SignInError): NextResponse => {
        const url = new URL(ROUTES.login, `${origin}/`);
        url.searchParams.set("error", error);
        return NextResponse.redirect(url);
    };

    const code = params.get("code");
    if (code === null) return failWith("linkInvalid");

    const db = await createServerDb();
    const { error } = await db.auth.exchangeCodeForSession(code);

    if (error !== null) {
        // Supabase reports a missing verifier as a generic bad-request; the
        // message is the only thing that distinguishes "wrong browser" from
        // "expired link", and the two need different advice.
        const missingVerifier = /code verifier|code_verifier/i.test(
            error.message
        );
        return failWith(missingVerifier ? "wrongBrowser" : "linkInvalid");
    }

    return NextResponse.redirect(
        new URL(safeReturnPath(params.get("next")), `${origin}/`)
    );
}
