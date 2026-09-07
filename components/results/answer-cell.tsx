"use client";

import { useTranslations } from "next-intl";

import { META } from "@/components/results/type";
import { assertNever } from "@/domain/assert-never";
import type { AnswerDisplay } from "@/lib/results/response-table";
import { cn } from "@/lib/utils";

/**
 * One respondent's answer to one question, in the individual-responses table.
 *
 * `toAnswerDisplay` returns the answer structured rather than joined into a
 * string, so the separators live here in the markup — a comma between chosen
 * options is punctuation, not copy, and a `", "` inside a pure module would
 * have been a hardcoded string with nowhere to translate it from.
 *
 * The switch is exhaustive: a sixth display shape has to be drawn.
 */
export function AnswerCell({ display }: { readonly display: AnswerDisplay }) {
    const t = useTranslations("Results.table");

    switch (display.kind) {
        case "empty":
            return (
                <span className={cn(META, "text-muted-foreground")}>
                    {t("empty")}
                </span>
            );

        case "text":
            return (
                <span className="line-clamp-3 break-words whitespace-pre-wrap">
                    {display.text}
                </span>
            );

        case "list":
            return (
                <ul className="flex flex-col gap-0.5">
                    {display.items.map((item, index) => (
                        // Option labels are unique within a question by
                        // construction, but a free-text "other" can repeat one.
                        <li key={`${index}-${item}`} className="truncate">
                            {item}
                        </li>
                    ))}
                </ul>
            );

        case "score":
            return (
                <span className={META}>
                    {t("scoreOf", {
                        value: display.value,
                        max: display.max
                    })}
                </span>
            );

        case "pairs":
            return (
                <ul className="flex flex-col gap-0.5">
                    {display.pairs.map(pair => (
                        <li key={pair.key} className="truncate">
                            <span className="text-muted-foreground">
                                {pair.label}
                            </span>{" "}
                            {pair.value}
                        </li>
                    ))}
                </ul>
            );

        default:
            return assertNever(display, "answer display");
    }
}
