"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Bar } from "@/components/marketing/bar";
import { Plate } from "@/components/marketing/plate";
import { OptionRow } from "@/components/runner/option-row";
import { DISPLAY } from "@/components/type";
import { cn } from "@/lib/utils";

/**
 * What the landing page asks, flattened out of the survey document so the
 * client bundle does not carry the question union or zod.
 */
export type AskQuestion = {
    /** The CSV column id this question's answers land under. */
    readonly key: string;
    readonly title: string;
    readonly options: readonly {
        readonly value: string;
        readonly label: string;
    }[];
    /**
     * Illustrative counts per option value, so the chart reads as a survey that
     * has been running rather than as an empty panel.
     *
     * Only the built-in question carries these, and the plate says
     * *demonstration data* on its face whenever they are present. A question
     * read from a real published survey gets none: attaching invented counts to
     * somebody's actual question would be the one dishonest thing on this page,
     * and the plate simply shows the visitor's own answer instead.
     */
    readonly baseline?: Readonly<Record<string, number>>;
    /**
     * A few illustrative recent answers, so the list beside the chart is never
     * a single row next to a count of forty-seven. Carried with `baseline` and
     * withheld for the same reason on a real survey's question.
     */
    readonly recent?: readonly {
        /** An already-translated relative time, e.g. "18 min tagasi". */
        readonly ago: string;
        /** The language that answer was given in, as `responses.locale` files it. */
        readonly locale: string;
        /** One of this question's option values. */
        readonly value: string;
    }[];
};

/**
 * The page's first viewport and its argument: the visitor is handed a real
 * question, and the moment they answer it they are shown the same answer from
 * the owner's side of the product.
 *
 * **Nothing is submitted.** `responses` is behind RLS and the anonymous key
 * cannot read an aggregate out of it, so a live tally here would need a new
 * public read path, and a landing page is a poor reason to open one. It would
 * also file a junk response against a real survey every time somebody scrolled
 * past. The answer stays in this component, the copy says so plainly, and the
 * visitor who wants to answer something for real is handed the demo survey's
 * own link.
 *
 * The three plates are rendered in every state rather than revealed on answer
 * (DESIGN §6: a panel defines its empty state, and it is the shape of what
 * will be there). That also means the page does not move when the answer
 * lands, the bars grow, the row arrives, and nothing reflows underneath.
 */
export function Ask({ question }: { readonly question: AskQuestion }) {
    const t = useTranslations("Landing");
    const locale = useLocale();
    const name = useId();

    const [chosen, setChosen] = useState<string | null>(null);
    const answered = chosen !== null;
    const owner = useRef<HTMLDivElement>(null);
    const revealed = useRef(false);

    // The one moment the page orchestrates. THESIS is sequential, answer,
    // *then* be shown the owner's side, so the owner's column starts below
    // the fold and the first answer brings it up. Once only: a visitor
    // changing their mind is not asking to be moved again, and `scrollIntoView`
    // honours `prefers-reduced-motion` on its own through `behavior: "smooth"`.
    useEffect(() => {
        if (!answered || revealed.current) return;
        revealed.current = true;
        owner.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [answered]);
    const chosenOption = question.options.find(
        option => option.value === chosen
    );

    // The visitor's own answer is added to the illustrative counts rather than
    // replacing them, so answering moves a real distribution by one instead of
    // switching a panel from empty to full.
    const baseline = question.baseline;
    const countFor = (value: string) =>
        (baseline?.[value] ?? 0) + (value === chosen ? 1 : 0);
    const total = question.options.reduce(
        (sum, option) => sum + countFor(option.value),
        0
    );

    // Estonian conventions whatever the page's language (DESIGN §9): comma
    // decimal, one place, as the results surface formats a share.
    const percent = new Intl.NumberFormat("et-EE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
    const share = (value: string) =>
        total === 0 ? 0 : (countFor(value) / total) * 100;

    const labelOf = (value: string) =>
        question.options.find(option => option.value === value)?.label ?? "";

    // Newest first, the visitor's own on top the moment they answer. The
    // illustrative rows are in three different languages on purpose: the
    // runner files `responses.locale`, and one survey answered in three
    // languages is the claim the section further down the page makes in words.
    const recent = question.recent ?? [];
    const rows = [
        ...(chosenOption === undefined
            ? []
            : [
                  {
                      id: "mine",
                      ago: t("plates.justNow"),
                      locale,
                      label: chosenOption.label,
                      mine: true
                  }
              ]),
        ...recent.map((row, index) => ({
            id: `demo-${index}`,
            ago: row.ago,
            locale: row.locale,
            label: labelOf(row.value),
            mine: false
        }))
    ];

    return (
        // One column, and the card is the only thing on the ground. The
        // owner's side begins below it rather than beside it: showing an empty
        // results panel in the first viewport would spend the reveal before
        // the visitor has done anything, and the largest shape on the page
        // would be a chart of nothing.
        <div className="flex flex-col gap-16">
            {/* The card is centred in what is left of the first screen, so the
                owner's side starts below the fold rather than peeking into it
                as a chart of nothing. `svh` because a phone's toolbars are
                part of the first screen and `vh` lies about them. */}
            <div className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-[620px] flex-col justify-center gap-3">
                {/* The runner's own card, at the runner's own density: 10px
                    radius, hairline, shadow-xs on paper (DESIGN §4). */}
                <article className="flex flex-col gap-3.5 rounded-survey border border-border/70 bg-survey-card px-4 py-4 shadow-xs">
                    <h2
                        id={`${name}-title`}
                        className="text-[17px] leading-[1.35] font-medium text-pretty"
                    >
                        {question.title}
                    </h2>
                    <div
                        role="radiogroup"
                        aria-labelledby={`${name}-title`}
                        className="flex flex-col gap-2"
                    >
                        {question.options.map(option => (
                            <OptionRow
                                key={option.value}
                                type="radio"
                                name={name}
                                value={option.value}
                                checked={chosen === option.value}
                                label={option.label}
                                onSelect={() => setChosen(option.value)}
                            />
                        ))}
                    </div>
                </article>
                <p
                    className="text-[12px] leading-[1.4] text-pretty text-muted-foreground"
                    aria-live="polite"
                >
                    {answered ? t("hero.note") : t("hero.hint")}
                </p>

                {/* The page's real heading, and deliberately under the card
                    rather than over it: the first thing on the ground stays the
                    question. It is still the document's `h1`, a demo question
                    is not what this page is about, whatever it looks like. */}
                <h1
                    className={cn(
                        DISPLAY,
                        "border-t border-border pt-5 text-[20px] leading-[1.3] text-pretty"
                    )}
                >
                    {t("hero.statement")}
                </h1>
            </div>

            <div
                ref={owner}
                className="flex min-w-0 scroll-mt-6 flex-col gap-4"
            >
                {/* The sentence that names what the plates are sits above the
                    plates. It reads as a caption to the column it belongs to;
                    under the card it was a caption to the wrong thing. */}
                <div className="flex flex-col gap-2">
                    <h2 className={cn(DISPLAY, "max-w-[22ch] text-balance")}>
                        {t("turn.title")}
                    </h2>
                    <p className="max-w-[56ch] text-[15px] leading-[1.45] text-pretty text-muted-foreground">
                        {t("turn.body")}
                    </p>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <Plate
                        label={t("plates.chart")}
                        aside={t("plates.count", { count: total })}
                        {...(baseline !== undefined && {
                            note: t("scale.demoLabel")
                        })}
                    >
                        <div className="flex flex-col gap-3">
                            {/* Five or fewer categories take `--chart-1` …
                                `--chart-5` in the author's order, no skipping
                                and no sorting (DESIGN §7) — the same rule
                                `toCategoryBars` applies on the results surface,
                                so this plate is coloured the way the owner's
                                real chart would be. The visitor's own bar is
                                marked with weight, an outline and a word, never
                                with a hue of its own. */}
                            {question.options.map((option, index) => {
                                const mine = option.value === chosen;
                                return (
                                    <Bar
                                        key={option.value}
                                        label={option.label}
                                        percent={share(option.value)}
                                        value={`${percent.format(share(option.value))}%`}
                                        fill={`var(--chart-${index + 1})`}
                                        emphasis={mine}
                                        aside={
                                            mine ? t("plates.yours") : undefined
                                        }
                                    />
                                );
                            })}
                        </div>
                    </Plate>

                    <Plate
                        label={t("plates.table")}
                        {...(recent.length > 0 && {
                            note: t("scale.demoLabel")
                        })}
                    >
                        <table className="w-full table-fixed border-collapse text-left">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="w-[34%] pb-2 text-[11px] leading-none font-medium text-muted-foreground">
                                        {t("plates.colTime")}
                                    </th>
                                    <th className="w-[22%] pb-2 text-[11px] leading-none font-medium text-muted-foreground">
                                        {t("plates.colLocale")}
                                    </th>
                                    <th className="pb-2 text-[11px] leading-none font-medium text-muted-foreground">
                                        {t("plates.colAnswer")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    // Only reachable on a real survey's
                                    // question, which carries no illustrative
                                    // rows: until the visitor answers there is
                                    // genuinely nothing here (DESIGN §6).
                                    <tr>
                                        <td className="truncate pt-2.5 text-[12px] leading-none tabular-nums">
                                            <EmptyCell />
                                        </td>
                                        <td className="pt-2.5 font-mono text-[12px] leading-none">
                                            <EmptyCell />
                                        </td>
                                        <td className="truncate pt-2.5 text-[12px] leading-none">
                                            <EmptyCell />
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map(row => (
                                        <tr key={row.id}>
                                            <td
                                                className={cn(
                                                    "truncate pt-2.5 text-[12px] leading-none tabular-nums",
                                                    row.mine && "font-medium"
                                                )}
                                            >
                                                {row.ago}
                                            </td>
                                            <td className="pt-2.5 font-mono text-[12px] leading-none">
                                                {row.locale}
                                            </td>
                                            <td
                                                className={cn(
                                                    "truncate pt-2.5 text-[12px] leading-none",
                                                    row.mine && "font-medium"
                                                )}
                                            >
                                                {row.label}
                                                {row.mine && (
                                                    <span className="ml-2 text-[11px] leading-none font-medium text-muted-foreground">
                                                        {t("plates.yours")}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </Plate>
                </div>
            </div>
        </div>
    );
}

/** A cell with nothing in it yet: the disabled token, never dimmed (§6). */
function EmptyCell() {
    return (
        <span aria-hidden className="text-input">
            -
        </span>
    );
}
