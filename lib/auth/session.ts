import "server-only";

import { redirect } from "next/navigation";

import { getProfile } from "@/lib/db/profiles";
import { ROUTES } from "@/lib/routes";
import { createServerDb } from "@/lib/supabase/server";

/** What the chrome needs to know about whoever is signed in. */
export type SessionUser = {
    readonly id: string;
    readonly email: string | null;
    readonly displayName: string | null;
};

/**
 * `getUser()` rather than `getSession()`: only the former revalidates the JWT
 * with the auth server, and a session read from a cookie is only as
 * trustworthy as the cookie.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
    const db = await createServerDb();
    const { data, error } = await db.auth.getUser();
    if (error !== null || data.user === null) return null;

    // The trigger on auth.users creates this row, but a profile can be absent
    // for a moment after the very first sign-in, so it is not load-bearing.
    const profile = await getProfile(db, data.user.id);

    return {
        id: data.user.id,
        email: profile?.email ?? data.user.email ?? null,
        displayName: profile?.displayName ?? null
    };
}

/**
 * For owner pages. The proxy already turned anonymous requests away; this is
 * the real check, because a proxy is an optimistic filter and not an
 * authorisation layer.
 */
export async function requireSessionUser(): Promise<SessionUser> {
    const user = await getSessionUser();
    if (user === null) redirect(ROUTES.login);
    return user;
}
