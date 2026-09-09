"use client";

import { ChevronRight, GitCompareArrows } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

import { ShareLink } from "@/components/surveys/share-link";
import { SurveyStatusBadge } from "@/components/surveys/status-badge";
import { SurveyRowActions } from "@/components/surveys/survey-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { APP_TIME_ZONE } from "@/lib/i18n/locales";
import { ROUTES } from "@/lib/routes";
import { describeTimestamp } from "@/lib/surveys/format";
import type { SurveyListItem, SurveyListRow } from "@/lib/surveys/list";
import { cn } from "@/lib/utils";

/**
 * The survey list.
 *
 * DESIGN.md §5 maps expand/collapse to `Collapsible`, which cannot be used
 * here: `CollapsibleContent` renders a `div`, and a `div` between `tbody` and
 * `tr` is invalid HTML that the browser hoists out of the table. The waves are
 * therefore conditional rows behind a disclosure button carrying
 * `aria-expanded`, which is what `CollapsibleTrigger` would have rendered
 * anyway. See docs/DECISIONS.md 013.
 *
 * Below `sm` the status and date columns are dropped and restated inside the
 * first cell instead. Five columns on a 380px screen meant a horizontal
 * scroll that pushed status, response count and date off the edge — and "how
 * many responses do I have" is the one thing an owner checks from a phone.
 * The response count keeps its column at every width for that reason.
 */

/** Columns that give way to the restatement inside the first cell. */
const WIDE_ONLY = "hidden sm:table-cell";

const MONO_META = "font-mono text-[11px] leading-none text-muted-foreground";

/**
 * The first column, which absorbs whatever width the others do not need.
 *
 * `TableCell` is `whitespace-nowrap`, which makes a cell's minimum its entire
 * contents and overrides every `min-w-0` inside it — so on a phone this column
 * claimed 273px of a 358px row and pushed the response count off the screen.
 * Everything in here truncates on its own, so the cell does not need the rule.
 */
const TITLE_CELL = "whitespace-normal";

/** The title is the way into the builder; DESIGN §5 gives the row no other. */
const TITLE_LINK =
    // `min-w-0` alongside `truncate`: a nowrap flex child reports its whole
    // text as its minimum unless told otherwise, and a long survey title was
    // then setting the width of the first column on every screen.
    "min-w-0 truncate rounded-xs hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none";

/** DESIGN §2: the Label level — Mono 10px, uppercase, wide tracking. */
const COLUMN_LABEL =
    "h-[30px] bg-muted font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase";

function Dot() {
    return <span aria-hidden>·</span>;
}

/** Joins meta fragments with the middle dot the design uses throughout. */
function MetaLine({ parts }: { readonly parts: readonly ReactNode[] }) {
    const present = parts.filter(part => part !== null && part !== false);
    if (present.length === 0) return null;

    return (
        <span className={cn(MONO_META, "flex min-w-0 items-center gap-1.5")}>
            {present.map((part, index) => (
                // The parts are a fixed, ordered set per row kind, so the index
                // is a stable identity here rather than a placeholder for one.
                <span key={index} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 && <Dot />}
                    <span className="min-w-0 truncate">{part}</span>
                </span>
            ))}
        </span>
    );
}

function UpdatedAt({ iso, now }: { readonly iso: string; readonly now: Date }) {
    const t = useTranslations("Surveys.time");
    const format = useFormatter();
    const date = new Date(iso);
    const described = describeTimestamp(iso, now, APP_TIME_ZONE);

    if (described.kind === "date") {
        return (
            <>
                {format.dateTime(date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                })}
            </>
        );
    }

    return (
        <>
            {t(described.kind, {
                time: format.dateTime(date, {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            })}
        </>
    );
}

function ResponseCount({ survey }: { readonly survey: SurveyListItem }) {
    const t = useTranslations("Surveys.meta");
    const format = useFormatter();

    // A draft that has never been published cannot have responses, so a zero
    // there is not a measurement — it is the absence of one.
    const neverCollected = survey.responseCount === 0 && survey.slug === null;

    return (
        <span className="font-mono text-[11px] leading-none tabular-nums">
            {neverCollected
                ? t("noResponses")
                : format.number(survey.responseCount)}
        </span>
    );
}

/** The second line under a survey's title, which differs by status. */
function SurveyMeta({ survey }: { readonly survey: SurveyListItem }) {
    const t = useTranslations("Surveys.meta");
    const format = useFormatter();

    if (survey.status === "published") return null;

    const questions = t("questions", { count: survey.questionCount });

    if (survey.status === "closed") {
        return (
            <MetaLine
                parts={[
                    survey.closedAt === null
                        ? t("linkClosed")
                        : t("linkClosedOn", {
                              date: format.dateTime(new Date(survey.closedAt), {
                                  day: "numeric",
                                  month: "short"
                              })
                          }),
                    questions
                ]}
            />
        );
    }

    return <MetaLine parts={[questions, t("notShared")]} />;
}

/**
 * The status badge and the "updated" timestamp, shown inside the first cell on
 * a screen too narrow for their own columns. `aria-hidden` is deliberately not
 * used: below `sm` this is the only place either value appears, and the
 * columns it stands in for are not in the accessibility tree either.
 */
function RowMetaOnNarrow({
    status,
    iso,
    now,
    className
}: {
    readonly status: SurveyListItem["status"];
    readonly iso: string;
    readonly now: Date;
    readonly className?: string;
}) {
    return (
        <div
            className={cn(
                // `min-w-0`: without it this line is the widest thing in the
                // cell and holds the whole column open, which on a phone put
                // the response count past the right edge — the one figure this
                // layout is arranged around.
                "flex min-w-0 items-center gap-2 sm:hidden",
                className
            )}
        >
            <SurveyStatusBadge status={status} />
            <span className={cn(MONO_META, "truncate")}>
                <UpdatedAt iso={iso} now={now} />
            </span>
        </div>
    );
}

function StandaloneRow({
    survey,
    now
}: {
    readonly survey: SurveyListItem;
    readonly now: Date;
}) {
    return (
        <TableRow className="h-[46px] hover:bg-muted">
            <TableCell className={cn("px-3 py-1.5", TITLE_CELL)}>
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <Link
                            href={ROUTES.builder(survey.id)}
                            className={cn(
                                TITLE_LINK,
                                "text-[13px] leading-[1.2] font-medium"
                            )}
                        >
                            {survey.title}
                        </Link>
                        {survey.status === "published" &&
                            survey.slug !== null && (
                                <ShareLink slug={survey.slug} />
                            )}
                    </div>
                    <SurveyMeta survey={survey} />
                    <RowMetaOnNarrow
                        status={survey.status}
                        iso={survey.updatedAt}
                        now={now}
                    />
                </div>
            </TableCell>
            <TableCell className={cn("px-3", WIDE_ONLY)}>
                <SurveyStatusBadge status={survey.status} />
            </TableCell>
            <TableCell className="px-3 text-right">
                <ResponseCount survey={survey} />
            </TableCell>
            <TableCell className={cn("px-3", MONO_META, WIDE_ONLY)}>
                <UpdatedAt iso={survey.updatedAt} now={now} />
            </TableCell>
            <TableCell className="px-2 text-right">
                <SurveyRowActions survey={survey} isWave={false} />
            </TableCell>
        </TableRow>
    );
}

function WaveRow({
    wave,
    now
}: {
    readonly wave: SurveyListItem;
    readonly now: Date;
}) {
    const t = useTranslations("Surveys.meta");
    const format = useFormatter();

    return (
        <TableRow className="h-[42px] hover:bg-muted">
            {/* DESIGN §3: a nested wave row is 8px of padding plus a 12px
                indent carried by a border-l rule, so the nesting is structural
                rather than a guessed margin. */}
            <TableCell className={cn("py-1.5 pr-2 pl-3", TITLE_CELL)}>
                <div className="ml-3 flex min-w-0 flex-col gap-1 border-l pl-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Link
                            href={ROUTES.builder(wave.id)}
                            className={cn(
                                TITLE_LINK,
                                "w-[8ch] shrink-0 font-mono text-[11px] leading-none"
                            )}
                        >
                            {wave.waveLabel ?? t("unlabelledWave")}
                        </Link>
                        {wave.status === "published" && wave.slug !== null ? (
                            <ShareLink slug={wave.slug} />
                        ) : wave.status === "closed" ? (
                            <MetaLine
                                parts={[
                                    t("linkClosed"),
                                    t("responsesArchived", {
                                        count: wave.responseCount
                                    })
                                ]}
                            />
                        ) : (
                            <MetaLine
                                parts={[
                                    t("questions", {
                                        count: wave.questionCount
                                    }),
                                    t("notShared")
                                ]}
                            />
                        )}
                    </div>
                    <RowMetaOnNarrow
                        status={wave.status}
                        iso={wave.updatedAt}
                        now={now}
                    />
                </div>
            </TableCell>
            <TableCell className={cn("px-3", WIDE_ONLY)}>
                <SurveyStatusBadge status={wave.status} />
            </TableCell>
            <TableCell className="px-3 text-right">
                <span className="font-mono text-[11px] leading-none tabular-nums">
                    {format.number(wave.responseCount)}
                </span>
            </TableCell>
            <TableCell className={cn("px-3", MONO_META, WIDE_ONLY)}>
                <UpdatedAt iso={wave.updatedAt} now={now} />
            </TableCell>
            <TableCell className="px-2 text-right">
                <SurveyRowActions survey={wave} isWave />
            </TableCell>
        </TableRow>
    );
}

function GroupRow({
    row,
    expanded,
    onToggle
}: {
    readonly row: Extract<SurveyListRow, { kind: "waveGroup" }>;
    readonly expanded: boolean;
    readonly onToggle: () => void;
}) {
    const t = useTranslations("Surveys.meta");
    const tActions = useTranslations("Surveys.rowActions");
    const format = useFormatter();

    const newest = row.waves[0];
    if (newest === undefined) return null;

    return (
        <TableRow className="h-[46px] bg-muted/40 hover:bg-muted">
            <TableCell className={cn("py-1.5 pr-3 pl-1", TITLE_CELL)}>
                <div className="flex min-w-0 items-start gap-1">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={expanded}
                        aria-label={
                            expanded ? tActions("collapse") : tActions("expand")
                        }
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                    >
                        <ChevronRight
                            aria-hidden
                            className={cn(
                                "size-3.5 transition-transform",
                                expanded && "rotate-90"
                            )}
                        />
                    </button>
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                            {/* The series has no page of its own; the newest
                                wave is the one an owner means by its name. */}
                            <Link
                                href={ROUTES.builder(newest.id)}
                                className={cn(
                                    TITLE_LINK,
                                    "text-[13px] leading-[1.2] font-medium"
                                )}
                            >
                                {row.title}
                            </Link>
                            <Badge
                                variant="outline"
                                className="h-5 shrink-0 rounded border-transparent bg-accent px-1.5 font-mono text-[9px] leading-none tracking-[0.04em] text-accent-foreground uppercase"
                            >
                                {t("waveBadge")}
                            </Badge>
                        </div>
                        <MetaLine
                            parts={[
                                t("series"),
                                t("waves", { count: row.waveCount }),
                                t("questions", { count: row.questionCount })
                            ]}
                        />
                        {/* A series has no badge to restate, so its status
                            column's wording comes down here instead. */}
                        <span className={cn(MONO_META, "sm:hidden")}>
                            {row.openCount > 0
                                ? t("open", { count: row.openCount })
                                : t("allClosed")}
                        </span>
                    </div>
                </div>
            </TableCell>
            <TableCell className={cn("px-3", MONO_META, WIDE_ONLY)}>
                {/* Plain text, not a badge: a series has no single status, and
                    a badge here would read as one. */}
                {row.openCount > 0
                    ? t("open", { count: row.openCount })
                    : t("allClosed")}
            </TableCell>
            <TableCell className="px-3 text-right">
                <span className="font-mono text-[11px] leading-none font-medium tabular-nums">
                    {format.number(row.responseCount)}
                </span>
            </TableCell>
            <TableCell className={cn("px-3", WIDE_ONLY)} />
            <TableCell className="px-2 text-right">
                <div className="flex items-center justify-end gap-1">
                    {/* DESIGN §5 gives the series a compare control, and 013
                        left it out until there was something behind it. This
                        is the only way into the comparison: it belongs to the
                        series, not to any one wave. */}
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-[26px] rounded px-2 font-mono text-[10px] tracking-[0.04em] uppercase"
                    >
                        <Link href={ROUTES.compare(row.waveGroupId)}>
                            <GitCompareArrows aria-hidden />
                            <span className="hidden sm:inline">
                                {tActions("compare")}
                            </span>
                            <span className="sr-only sm:hidden">
                                {tActions("compare")}
                            </span>
                        </Link>
                    </Button>
                    {/* The menu acts on the newest wave — the live one, and the
                        one "new wave" has to copy for the keys to line up. */}
                    <SurveyRowActions survey={newest} isWave />
                </div>
            </TableCell>
        </TableRow>
    );
}

export function SurveyTable({
    rows,
    now
}: {
    readonly rows: readonly SurveyListRow[];
    readonly now: Date;
}) {
    const t = useTranslations("Surveys.columns");
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

    function toggle(waveGroupId: string) {
        setCollapsed(current => {
            const next = new Set(current);
            if (!next.delete(waveGroupId)) next.add(waveGroupId);
            return next;
        });
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(COLUMN_LABEL, "px-3")}>
                        {t("survey")}
                    </TableHead>
                    <TableHead
                        className={cn(
                            COLUMN_LABEL,
                            "w-[132px] px-3",
                            WIDE_ONLY
                        )}
                    >
                        {t("status")}
                    </TableHead>
                    <TableHead
                        className={cn(
                            COLUMN_LABEL,
                            "w-[104px] px-3 text-right"
                        )}
                    >
                        {t("responses")}
                    </TableHead>
                    <TableHead
                        className={cn(
                            COLUMN_LABEL,
                            "w-[136px] px-3",
                            WIDE_ONLY
                        )}
                    >
                        {t("updated")}
                    </TableHead>
                    <TableHead className={cn(COLUMN_LABEL, "w-[52px] px-2")}>
                        <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map(row =>
                    row.kind === "survey" ? (
                        <StandaloneRow key={row.id} survey={row} now={now} />
                    ) : (
                        <Fragment key={row.waveGroupId}>
                            <GroupRow
                                row={row}
                                expanded={!collapsed.has(row.waveGroupId)}
                                onToggle={() => toggle(row.waveGroupId)}
                            />
                            {!collapsed.has(row.waveGroupId) &&
                                row.waves.map(wave => (
                                    <WaveRow
                                        key={wave.id}
                                        wave={wave}
                                        now={now}
                                    />
                                ))}
                        </Fragment>
                    )
                )}
            </TableBody>
        </Table>
    );
}
