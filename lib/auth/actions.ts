"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { failed, ok, runAction, type ActionResult } from "@/lib/actions/result";
import type { SignInError } from "@/lib/auth/errors";
import { siteUrl } from "@/lib/env";
import { ROUTES, safeReturnPath } from "@/lib/routes";
import { createServerDb } from "@/lib/supabase/server";

const SignInInputSchema = z.object({
    email: z.email().max(254),
    next: z.string().nullable()
});

export type SignInResult = ActionResult<{ email: string }, SignInError>;

/**
 * Sends a magic link. A Server Action is a public POST endpoint, so the input
 * is re-parsed here rather than trusted from the form.
 *
 * Success is deliberately not distinguishable from "no such account": Supabase
 * creates the user on first link, and reporting otherwise would turn this into
 * an email-enumeration oracle.
 */
export async function sendMagicLink(
    _previous: SignInResult | null,
    formData: FormData
): Promise<SignInResult> {
    return runAction<{ email: string }, SignInError>("sendFailed", async () => {
        const parsed = SignInInputSchema.safeParse({
            email: formData.get("email"),
            next: formData.get("next")
        });
        if (!parsed.success) return failed("invalidEmail");

        const returnPath = safeReturnPath(parsed.data.next);
        const callback = new URL(ROUTES.authCallback, `${siteUrl()}/`);
        callback.searchParams.set("next", returnPath);

        const db = await createServerDb();
        const { error } = await db.auth.signInWithOtp({
            email: parsed.data.email,
            options: { emailRedirectTo: callback.toString() }
        });

        if (error !== null) {
            return failed(error.status === 429 ? "rateLimited" : "sendFailed");
        }
        return ok({ email: parsed.data.email });
    });
}

/** Clears the session cookies and lands on the sign-in page. */
export async function signOut(): Promise<void> {
    const db = await createServerDb();
    await db.auth.signOut();
    redirect(ROUTES.login);
}
