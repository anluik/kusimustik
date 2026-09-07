"use client";

import {
    createColumnHelper,
    createSortedRowModel,
    rowSortingFeature,
    tableFeatures,
    useTable
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AnswerCell } from "@/components/results/answer-cell";
import { LABEL, META } from "@/components/results/type";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import type { SurveyElement } from "@/domain/question";
import {
    matchesResponseSearch,
    tableQuestions
} from "@/lib/results/response-table";
import type { ResponseRow } from "@/lib/results/response-table";
import { APP_TIME_ZONE } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Individual responses, one row per submission (PLAN Phase 7).
 *
 * TanStack Table v9 — `useTable`, not v8's `useReactTable`, and row models are
 * registered as feature slots rather than table options. Only the sorting
 * feature is registered: a feature that is not registered has no state, which
 * is the point of the v9 model.
 *
 * The search is applied before the data reaches the table rather than through
 * the filtering feature. It matches `row.searchText`, which is built from the
 * *answers* — so the result does not change with the owner's UI language, as a
 * filter over rendered cells would.
 */

const features = tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel()
});

const helper = createColumnHelper<typeof features, ResponseRow>();

/** Never rebuilt: a fresh array invalidates every data-dependent model. */
const NO_ROWS: readonly ResponseRow[] = [];

export function ResponsesTable({
    elements,
    rows
}: {
    readonly elements: readonly SurveyElement[];
    readonly rows: readonly ResponseRow[];
}) {
    const t = useTranslations("Results.table");
    const format = useFormatter();
    const [query, setQuery] = useState("");

    const questions = useMemo(() => tableQuestions(elements), [elements]);

    const data = useMemo(
        () =>
            query.trim() === ""
                ? [...rows]
                : rows.filter(row => matchesResponseSearch(row, query)),
        [rows, query]
    );

    const columns = useMemo(
        () =>
            helper.columns([
                helper.accessor("submittedAt", {
                    id: "submittedAt",
                    header: t("submittedAt"),
                    cell: info => (
                        <span className={cn(META, "whitespace-nowrap")}>
                            {format.dateTime(new Date(info.getValue()), {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: APP_TIME_ZONE
                            })}
                        </span>
                    )
                }),
                ...questions.map(question =>
                    // Accessing through the cells map rather than a generated
                    // key: question ids are uuids, and an accessor path built
                    // from one would be parsed as a deep path by the library.
                    helper.display({
                        id: question.id,
                        header: question.title,
                        enableSorting: false,
                        cell: info => (
                            <AnswerCell
                                display={
                                    info.row.original.cells.get(
                                        question.id
                                    ) ?? {
                                        kind: "empty"
                                    }
                                }
                            />
                        )
                    })
                )
            ]),
        [questions, t, format]
    );

    const table = useTable({
        features,
        data: data.length === 0 ? NO_ROWS : data,
        columns,
        getRowId: row => row.id,
        initialState: {
            // Newest first: the owner opening this wants the latest response.
            sorting: [{ id: "submittedAt", desc: true }]
        }
    });

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <Input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    aria-label={t("search")}
                    placeholder={t("search")}
                    className="h-[30px] max-w-64 rounded text-xs"
                />
                <span className={cn(META, "text-muted-foreground")}>
                    {t("rowCount", {
                        shown: format.number(data.length),
                        total: format.number(rows.length)
                    })}
                </span>
            </div>

            {/* DESIGN: wide content scrolls inside its own container; the page
                body never scrolls horizontally. */}
            <div className="overflow-x-auto rounded border">
                <Table>
                    <caption className="sr-only">{t("caption")}</caption>
                    <TableHeader>
                        {table.getHeaderGroups().map(group => (
                            <TableRow key={group.id}>
                                {group.headers.map(header => {
                                    const sortable = header.column.getCanSort();
                                    const direction =
                                        header.column.getIsSorted();

                                    return (
                                        <TableHead
                                            key={header.id}
                                            aria-sort={ariaSort(direction)}
                                            className={cn(
                                                LABEL,
                                                "h-[30px] bg-muted whitespace-nowrap text-muted-foreground"
                                            )}
                                        >
                                            {header.isPlaceholder ? null : sortable ? (
                                                <button
                                                    type="button"
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    className="flex items-center gap-1.5 rounded-xs uppercase focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                                                >
                                                    <table.FlexRender
                                                        header={header}
                                                    />
                                                    <SortIcon
                                                        direction={direction}
                                                    />
                                                </button>
                                            ) : (
                                                <table.FlexRender
                                                    header={header}
                                                />
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.map(row => (
                            <TableRow key={row.id} className="hover:bg-muted">
                                {row.getAllCells().map(cell => (
                                    <TableCell
                                        key={cell.id}
                                        className="max-w-64 align-top text-xs"
                                    >
                                        <table.FlexRender cell={cell} />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {data.length === 0 && rows.length > 0 && (
                <p className="text-xs leading-[1.35] text-muted-foreground">
                    {t("noMatches")}
                </p>
            )}
        </div>
    );
}

function SortIcon({
    direction
}: {
    readonly direction: false | "asc" | "desc";
}) {
    const Icon =
        direction === "asc"
            ? ArrowUp
            : direction === "desc"
              ? ArrowDown
              : ChevronsUpDown;
    return <Icon aria-hidden className="size-3" />;
}

function ariaSort(
    direction: false | "asc" | "desc"
): "ascending" | "descending" | undefined {
    if (direction === "asc") return "ascending";
    if (direction === "desc") return "descending";
    return undefined;
}
