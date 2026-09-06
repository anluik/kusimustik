"use client";

import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CreateSurveyDialog } from "@/components/surveys/create-survey-dialog";
import { SurveyTable } from "@/components/surveys/survey-table";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
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
    const tFilter = useTranslations("Surveys.filter");
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
                        <div className="relative hidden sm:block">
                            <Search
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                type="search"
                                value={query}
                                onChange={event =>
                                    setQuery(event.currentTarget.value)
                                }
                                aria-label={t("search.label")}
                                placeholder={t("search.placeholder")}
                                className="h-[30px] w-56 rounded pl-7 text-xs"
                            />
                        </div>
                        <Select
                            value={status}
                            onValueChange={value => {
                                const next = STATUS_FILTERS.find(
                                    candidate => candidate === value
                                );
                                if (next !== undefined) setStatus(next);
                            }}
                        >
                            <SelectTrigger
                                aria-label={tFilter("label")}
                                className="hidden h-[30px]! w-36 rounded text-xs sm:flex"
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
                                        {tFilter(option)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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

            <main className="flex flex-col gap-2 p-4">
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
            </main>

            <CreateSurveyDialog open={creating} onOpenChange={setCreating} />
        </>
    );
}
