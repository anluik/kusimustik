import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { isSignInError } from "@/lib/auth/errors";
import { safeReturnPath } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("Auth");
    return { title: t("title") };
}

/**
 * `next` and `error` both arrive from outside — `next` survived an email round
 * trip and `error` is set by the callback route handler, which cannot render
 * copy of its own. Neither is trusted: the path is re-validated and the error
 * is narrowed to a known code before it selects a message.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
    const params = await searchParams;
    const error = isSignInError(params.error) ? params.error : null;
    const returnPath = safeReturnPath(
        typeof params.next === "string" ? params.next : null
    );

    return <LoginForm returnPath={returnPath} initialError={error} />;
}
