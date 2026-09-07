"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/components/shell/error-panel";

/**
 * The owner surfaces' error boundary (docs/PLAN.md Phase 8).
 *
 * It sits at the group rather than on each page so every owner route has one,
 * and inside the `(app)` layout so the sidebar and the chrome stay on screen —
 * DESIGN §6: never a full-page error for a partial failure. The layout's own
 * failures are not caught here; that is what `global-error.tsx` is for.
 *
 * `reset()` re-renders the segment, which re-runs the server component that
 * threw. That is the right retry for the failures this actually sees: a
 * database round trip that timed out, or a session that expired mid-read.
 */
export default function AppError({
    error,
    reset
}: {
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
}) {
    useEffect(() => {
        // The digest is all the browser gets; the message is only in the
        // server log in production, so log the object we do have.
        console.error("owner surface failed", error);
    }, [error]);

    return <ErrorPanel digest={error.digest} onRetry={reset} />;
}
