"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/components/shell/error-panel";

/**
 * The signed-out surfaces' boundary. Sign-in is where a stranger meets a
 * Supabase outage first, and the default Next.js error page would tell them
 * nothing they could act on — this at least says what happened, in their own
 * language, with a retry.
 */
export default function AuthError({
    error,
    reset
}: {
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
}) {
    useEffect(() => {
        console.error("sign-in surface failed", error);
    }, [error]);

    return <ErrorPanel digest={error.digest} onRetry={reset} />;
}
