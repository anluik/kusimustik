"use client";

import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CreateSurveyDialog } from "@/components/surveys/create-survey-dialog";
import { SurveyTable } from "@/components/surveys/survey-table";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    STATUS_FILTERS,
    buildSurveyListRows,
    countSurveys,
    countWaveGroups,
    filterSurveyListRows,
    type StatusFilter,
    type SurveyListItem
} from "@/lib/surveys/list";
import { cn } from "@/lib/utils";

/**
 * The survey list screen.
 *
 * One client component spans the app bar and the table because the search box
 * lives in the bar and filters the table — splitting them would mean lifting
 * the query into a URL parameter and re-rendering the page on every keystroke.
 * The rows themselves are fetched on the server and arrive as props; filtering
 * is local and instant.
 *
 * `now` comes from the server so that "today" means the same thing in the
 * server render and the hydrated one.
 */
export function SurveysScreen({
    items,
    nowIso
}: {
    readonly items: readonly SurveyListItem[];
    readonly nowIso: string;
}) {
    const t = useTranslations("Surveys");
    const format = useFormatter();

    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [creating, setCreating] = useState(false);

    const now = useMemo(() => new Date(nowIso), [nowIso]);
    const allRows = useMemo(() => buildSurveyListRows(items), [items]);
    const rows = useMemo(
        () => filterSurveyListRows(allRows, { query, status }),
        [allRows, query, status]
    );

    const total = items.length;
    const shown = countSurveys(rows);
    const groups = countWaveGroups(rows);

    function clearFilters() {
        setQuery("");
        setStatus("all");
    }

    return (
        <>
            <AppBar
                constrained
                title={t("title")}
                meta={
                    <span className="flex items-center gap-1.5">
                        <span>{t("count", { count: shown })}</span>
                        {groups > 0 && (
                            <>
                                <span aria-hidden>·</span>
                                <span>
                                    {t("waveGroupCount", { count: groups })}
                                </span>
                            </>
                        )}
                    </span>
                }
                actions={
                    <>
                        {/* The bar is 44px and a phone has no room for these
                            beside the title, so below `sm` the same two
                            controls are rendered over the table instead —
                            hidden, not dropped. */}
                        <SearchField
                            value={query}
                            onChange={setQuery}
                            className="hidden sm:block"
                        />
                        <StatusFilterSelect
                            value={status}
                            onChange={setStatus}
                            className="hidden sm:flex"
                        />
                        <Button
                            size="sm"
                            onClick={() => setCreating(true)}
                            className="h-[30px] rounded text-xs"
                        >
                            {t("new")}
                        </Button>
                    </>
                }
            />

            {/* A `div`: `SidebarInset` is the page's `main`, and a document
                may not nest one inside another. */}
            <div className={cn("flex flex-col gap-2 p-4", PAGE_WIDTH)}>
                {total > 0 && (
                    <div className="flex items-center gap-2 sm:hidden">
                        <SearchField
                            value={query}
                            onChange={setQuery}
                            className="flex-1"
                        />
                        <StatusFilterSelect
                            value={status}
                            onChange={setStatus}
                        />
                    </div>
                )}

                <section className="overflow-hidden rounded border bg-card">
                    {total === 0 ? (
                        <EmptyState
                            title={t("empty.title")}
                            body={t("empty.body")}
                            preview={
                                <>
                                    <EmptyStateRow />
                                    <EmptyStateRow />
                                    <EmptyStateRow />
                                </>
                            }
                            actions={
                                <Button
                                    size="sm"
                                    onClick={() => setCreating(true)}
                                    className="h-[30px] rounded text-xs"
                                >
                                    {t("empty.action")}
                                </Button>
                            }
                        />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title={t("noResults.title")}
                            body={t("noResults.body")}
                            preview={
                                <>
                                    <EmptyStateRow />
                                    <EmptyStateRow />
                                </>
                            }
                            actions={
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={clearFilters}
                                    className="h-[30px] rounded text-xs"
                                >
                                    {t("noResults.action")}
                                </Button>
                            }
                        />
                    ) : (
                        <SurveyTable rows={rows} now={now} />
                    )}
                </section>

                {total > 0 && (
                    <footer className="flex items-center justify-between px-1 font-mono text-[11px] leading-none text-muted-foreground">
                        <span>
                            {t("footer.shown", {
                                shown: format.number(shown),
                                total: format.number(total)
                            })}
                        </span>
                        <span>{t("footer.sorted")}</span>
                    </footer>
                )}
            </div>

            <CreateSurveyDialog open={creating} onOpenChange={setCreating} />
        </>
    );
}

/**
 * Search and the status filter, so the app bar and the phone's own row are the
 * same two controls rather than two copies that drift.
 */
function SearchField({
    value,
    onChange,
    className
}: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly className?: string;
}) {
    const t = useTranslations("Surveys.search");

    return (
        <div className={cn("relative", className)}>
            <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
                type="search"
                value={value}
                onChange={event => onChange(event.currentTarget.value)}
                aria-label={t("label")}
                placeholder={t("placeholder")}
                className="h-[30px] w-full rounded pl-7 text-xs sm:w-56"
            />
        </div>
    );
}

function StatusFilterSelect({
    value,
    onChange,
    className
}: {
    readonly value: StatusFilter;
    readonly onChange: (value: StatusFilter) => void;
    readonly className?: string;
}) {
    const t = useTranslations("Surveys.filter");

    return (
        <Select
            value={value}
            onValueChange={next => {
                const chosen = STATUS_FILTERS.find(
                    candidate => candidate === next
                );
                if (chosen !== undefined) onChange(chosen);
            }}
        >
            <SelectTrigger
                aria-label={t("label")}
                className={cn("h-[30px]! w-36 rounded text-xs", className)}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded">
                {STATUS_FILTERS.map(option => (
                    <SelectItem
                        key={option}
                        value={option}
                        className="rounded text-xs"
                    >
                        {t(option)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
