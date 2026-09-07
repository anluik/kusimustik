"use client";

import { useEffect } from "react";

import "@/app/globals.css";

import { Button } from "@/components/ui/button";
import { sans, mono } from "@/lib/fonts";
import messages from "@/messages/app/et.json";
import { cn } from "@/lib/utils";

/**
 * The last resort: a root layout itself threw, so there is no `<html>` to
 * render into and no provider to read from. It replaces the document, which is
 * why the shell is repeated here.
 *
 * **Its copy is Estonian, always.** The locale lives in a cookie that a client
 * component cannot read, and the provider that would have carried the
 * translation is part of what failed. Estonian is the source of truth for the
 * catalogue (CLAUDE.md), so the strings are read straight from it rather than
 * written inline — a hardcoded Estonian string is the same bug as a hardcoded
 * English one, and this way a copy edit still reaches this page. See
 * docs/DECISIONS.md 019.
 */
export default function GlobalError({
    error,
    reset
}: {
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
}) {
    useEffect(() => {
        console.error("root layout failed", error);
    }, [error]);

    return (
        <html lang="et" className={cn(sans.variable, mono.variable)}>
            <body className="grid min-h-svh place-items-center bg-background p-4 font-sans text-foreground antialiased">
                <main
                    role="alert"
                    className="flex w-full max-w-sm flex-col gap-3 rounded border bg-card px-3.5 py-4"
                >
                    <h1 className="text-[17px] leading-[1.3] font-semibold">
                        {messages.Errors.title}
                    </h1>
                    <p className="text-[14px] leading-[1.35] text-muted-foreground">
                        {messages.Errors.body}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={reset}
                            className="h-[30px] rounded text-xs"
                        >
                            {messages.Common.retry}
                        </Button>
                        {error.digest !== undefined && (
                            <span className="font-mono text-[10px] leading-none tracking-[0.04em] text-muted-foreground">
                                {messages.Errors.reference} {error.digest}
                            </span>
                        )}
                    </div>
                </main>
            </body>
        </html>
    );
}
