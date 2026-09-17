"use client";

import { LayoutList } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ComparisonRowActions } from "@/components/comparisons/comparison-row-actions";
import { NewComparisonDialog } from "@/components/comparisons/new-comparison-dialog";
import { useWaveName } from "@/components/comparisons/wave-name";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { ErrorLine } from "@/components/shell/error-line";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { MAX_COMPARED_WAVES, MIN_COMPARED_WAVES } from "@/domain/comparison";
import type { WaveGroupId } from "@/domain/ids";
import { createComparisonAction } from "@/lib/comparisons/actions";
import type { ComparisonActionError } from "@/lib/comparisons/errors";
import type { GroupWave } from "@/lib/comparisons/group";
import { newestWaves } from "@/lib/comparisons/group";
import type { ComparisonSummary } from "@/lib/db/comparisons";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const COLUMN_LABEL =
    "h-[30px] bg-muted px-3 font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase";
const MONO_META = "font-mono text-[11px] leading-none text-muted-foreground";
const WIDE_ONLY = "hidden sm:table-cell";

/**
 * One recurring survey's saved comparisons (DESIGN §5), reached from the
 * survey list's compare control.
 *
 * A group with one wave has nothing to compare and says how to get a second.
 * A group with two or more and no comparison yet offers "compare all waves",
 * which builds one over the newest waves the palette holds, with suggested
 * matches — what the old automatic view showed, one click away and
 * reviewable (docs/DECISIONS.md 035).
 */
export function ComparisonListScreen({
    waveGroupId,
    title,
    group,
    comparisons
}: {
    readonly waveGroupId: WaveGroupId;
    /** The newest wave's title: the wording the owner last chose. */
    readonly title: string;
    /** Every wave of the group, oldest first. */
    readonly group: readonly GroupWave[];
    readonly comparisons: readonly ComparisonSummary[];
}) {
    const t = useTranslations("Waves");
    const format = useFormatter();
    const waveName = useWaveName();
    const [creating, setCreating] = useState(false);

    const canCompare = group.length >= MIN_COMPARED_WAVES;
    const named = new Map(group.map(wave => [wave.surveyId, waveName(wave)]));

    const newButton = (
        <Button
            size="sm"
            disabled={!canCompare}
            onClick={() => setCreating(true)}
            className="h-[30px] rounded text-xs"
        >
            {t("list.new")}
        </Button>
    );

    return (
        <>
            <AppBar
                constrained
                title={title}
                meta={t("list.count", { count: comparisons.length })}
                actions={
                    <>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-[30px] rounded text-xs"
                        >
                            <Link href={ROUTES.surveys}>
                                <LayoutList aria-hidden />
                                <span className="hidden sm:inline">
                                    {t("backToSurveys")}
                                </span>
                                <span className="sr-only sm:hidden">
                                    {t("backToSurveys")}
                                </span>
                            </Link>
                        </Button>
                        {canCompare ? (
                            newButton
                        ) : (
                            // A disabled button swallows pointer events, so
                            // the tooltip hangs on a wrapper that does not.
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span tabIndex={0}>{newButton}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t("list.needsTwoWaves")}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </>
                }
            />

            <div className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}>
                {comparisons.length === 0 ? (
                    <Card className="gap-3 rounded px-3.5 py-3">
                        {canCompare ? (
                            <CompareAll
                                waveGroupId={waveGroupId}
                                group={group}
                                onChoose={() => setCreating(true)}
                            />
                        ) : (
                            <EmptyState
                                title={t("empty.oneWave.title")}
                                body={t("empty.oneWave.body")}
                                preview={<Preview />}
                                actions={
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="outline"
                                        className="h-[30px] rounded text-xs"
                                    >
                                        <Link href={ROUTES.surveys}>
                                            {t("backToSurveys")}
                                        </Link>
                                    </Button>
                                }
                            />
                        )}
                    </Card>
                ) : (
                    <Card className="gap-0 overflow-hidden rounded p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className={COLUMN_LABEL}>
                                        {t("list.columns.name")}
                                    </TableHead>
                                    <TableHead
                                        className={cn(COLUMN_LABEL, WIDE_ONLY)}
                                    >
                                        {t("list.columns.waves")}
                                    </TableHead>
                                    <TableHead
                                        className={cn(COLUMN_LABEL, WIDE_ONLY)}
                                    >
                                        {t("list.columns.updated")}
                                    </TableHead>
                                    <TableHead className={COLUMN_LABEL}>
                                        <span className="sr-only">
                                            {t("rowActions.label")}
                                        </span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisons.map(comparison => {
                                    const waves = comparison.surveyIds
                                        .map(id => named.get(id))
                                        .filter(
                                            (name): name is string =>
                                                name !== undefined
                                        )
                                        .join(" · ");
                                    return (
                                        <TableRow
                                            key={comparison.id}
                                            className="h-[42px] hover:bg-muted"
                                        >
                                            <TableCell className="px-3 whitespace-normal">
                                                <div className="flex min-w-0 flex-col gap-1">
                                                    <Link
                                                        href={ROUTES.comparison(
                                                            comparison.id
                                                        )}
                                                        className="min-w-0 truncate rounded-xs text-[13px] leading-[1.2] font-medium hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                                                    >
                                                        {comparison.name}
                                                    </Link>
                                                    <span
                                                        className={cn(
                                                            MONO_META,
                                                            "truncate sm:hidden"
                                                        )}
                                                    >
                                                        {waves}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell
                                                className={cn(
                                                    "px-3",
                                                    MONO_META,
                                                    WIDE_ONLY
                                                )}
                                            >
                                                {waves}
                                            </TableCell>
                                            <TableCell
                                                className={cn(
                                                    "px-3",
                                                    MONO_META,
                                                    WIDE_ONLY
                                                )}
                                            >
                                                {format.dateTime(
                                                    new Date(
                                                        comparison.updatedAt
                                                    ),
                                                    {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric"
                                                    }
                                                )}
                                            </TableCell>
                                            <TableCell className="px-2 text-right">
                                                <ComparisonRowActions
                                                    comparisonId={comparison.id}
                                                    name={comparison.name}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                )}
            </div>

            <NewComparisonDialog
                waveGroupId={waveGroupId}
                group={group}
                open={creating}
                onOpenChange={setCreating}
            />
        </>
    );
}

function Preview() {
    return (
        <>
            <EmptyStateRow />
            <EmptyStateRow />
            <EmptyStateRow />
        </>
    );
}

/** The empty state's one-click comparison of the newest waves. */
function CompareAll({
    waveGroupId,
    group,
    onChoose
}: {
    readonly waveGroupId: WaveGroupId;
    readonly group: readonly GroupWave[];
    readonly onChoose: () => void;
}) {
    const t = useTranslations("Waves");
    const tErrors = useTranslations("Waves.errors");
    const waveName = useWaveName();
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<ComparisonActionError | null>(null);

    function compareAll() {
        const waves = newestWaves(group, MAX_COMPARED_WAVES);
        const first = waves[0];
        const last = waves.at(-1);
        if (first === undefined || last === undefined) return;

        setError(null);
        startTransition(async () => {
            const result = await createComparisonAction({
                waveGroupId,
                name: `${waveName(first)} – ${waveName(last)}`,
                surveyIds: waves.map(wave => wave.surveyId)
            });
            if (result.ok) {
                router.push(ROUTES.comparison(result.data.comparisonId));
            } else {
                setError(result.error);
            }
        });
    }

    return (
        <EmptyState
            title={t("empty.noComparisons.title")}
            body={t("empty.noComparisons.body")}
            preview={<Preview />}
            actions={
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            disabled={pending}
                            onClick={compareAll}
                            className="h-[30px] rounded text-xs"
                        >
                            {t("empty.noComparisons.compareAll")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={onChoose}
                            className="h-[30px] rounded text-xs"
                        >
                            {t("list.new")}
                        </Button>
                    </div>
                    <ErrorLine
                        message={error === null ? null : tErrors(error)}
                    />
                </div>
            }
        />
    );
}
