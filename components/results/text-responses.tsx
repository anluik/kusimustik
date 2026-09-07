"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { META } from "@/components/results/type";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A text question has no chart — `chartKindsFor` returns nothing for one — so
 * its card shows the answers themselves.
 *
 * Capped until asked, because a long-text question on a survey with a thousand
 * responses is a thousand paragraphs, and the card sits in a scrolling list of
 * other cards. The count above says how many there are, so the cap never hides
 * the size of what is there.
 */
const PREVIEW_COUNT = 8;

export function TextResponses({
    responses,
    emptyLabel
}: {
    readonly responses: readonly string[];
    /** Shown when nobody wrote anything; supplied so the copy stays in one place. */
    readonly emptyLabel?: string;
}) {
    const t = useTranslations("Results.text");
    const [expanded, setExpanded] = useState(false);

    if (responses.length === 0) {
        return (
            <p className="text-xs leading-[1.35] text-muted-foreground">
                {emptyLabel ?? t("empty")}
            </p>
        );
    }

    const shown = expanded ? responses : responses.slice(0, PREVIEW_COUNT);

    return (
        <div className="flex flex-col gap-2">
            <p className={cn(META, "text-muted-foreground")}>
                {t("count", { count: responses.length })}
            </p>

            <ul className="flex flex-col gap-px">
                {shown.map((response, index) => (
                    // Free text is not unique and has no id of its own; the
                    // position in a list that only ever grows at the end is the
                    // stable identity available.
                    <li
                        key={`${index}-${response.slice(0, 24)}`}
                        className="rounded bg-muted px-2.5 py-2 text-xs leading-[1.35] break-words whitespace-pre-wrap"
                    >
                        {response}
                    </li>
                ))}
            </ul>

            {responses.length > PREVIEW_COUNT && (
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded text-xs"
                        onClick={() => setExpanded(open => !open)}
                    >
                        {expanded ? t("showLess") : t("showAll")}
                    </Button>
                </div>
            )}
        </div>
    );
}
