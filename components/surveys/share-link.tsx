"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/routes";

const COPIED_FOR_MS = 2000;

/**
 * DESIGN.md §5: a flat read-only `Input` in Mono plus an outline button whose
 * label swaps for two seconds. **No toast** — the confirmation belongs where
 * the action was, and a copy is not something the owner has to act on.
 *
 * The displayed link is deliberately host-relative-looking (`…/k/slug`) while
 * what lands on the clipboard is absolute, because the pasted link has to work.
 */
export function ShareLink({ slug }: { readonly slug: string }) {
    const t = useTranslations("Surveys.share");
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        []
    );

    const path = ROUTES.runner(slug);

    async function copy() {
        // `window` rather than a build-time site URL: the owner is looking at
        // the host they are on, and that is the host the link has to work on.
        const absolute = new URL(path, window.location.origin).toString();
        try {
            await navigator.clipboard.writeText(absolute);
        } catch {
            // Clipboard permission denied, or an insecure origin. The input is
            // right there and selectable, so there is nothing to report.
            return;
        }
        setCopied(true);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    }

    return (
        <span className="flex min-w-0 items-center gap-2">
            <Input
                readOnly
                value={path}
                aria-label={t("label")}
                onFocus={event => event.currentTarget.select()}
                className="h-6 w-fit max-w-[26ch] min-w-0 truncate rounded border-transparent bg-muted px-1.5 font-mono text-[11px] leading-none shadow-none"
            />
            <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={copy}
                className="rounded text-xs"
            >
                {copied ? t("copied") : t("copy")}
            </Button>
        </span>
    );
}
