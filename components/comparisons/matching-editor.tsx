"use client";

import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useElementTypeName } from "@/components/builder/element-type";
import { useWaveName } from "@/components/comparisons/wave-name";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { PAGE_WIDTH } from "@/components/shell/page-width";
import { SaveIndicator } from "@/components/shell/save-indicator";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import {
    MAX_COMPARED_WAVES,
    rowQuestions,
    rowVerdict
} from "@/domain/comparison";
import type {
    ComparisonDocument,
    ComparisonRow,
    ComparisonWave,
    MatchVerdict
} from "@/domain/comparison";
import type {
    ComparisonId,
    ComparisonRowId,
    QuestionId,
    SurveyId
} from "@/domain/ids";
import { newComparisonRowId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { AnswerableQuestion } from "@/domain/question";
import { useComparisonEditor } from "@/hooks/use-comparison-editor";
import type { EditorAction } from "@/lib/comparisons/editor";
import { incompleteRows, unmatchedQuestions } from "@/lib/comparisons/editor";
import type { GroupWave } from "@/lib/comparisons/group";
import { toComparisonWaves } from "@/lib/comparisons/group";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { LABEL, META, TAG } from "@/components/type";

/**
 * The matching editor (DESIGN §5): which question in each wave is the same
 * question, decided by the owner (docs/DECISIONS.md 035).
 *
 * One row per matched question, one `Select` per wave. Every question of a wave
 * is offered in every row: one already in another row says so and moves when
 * chosen, and one the row's rules refuse is disabled — there is never a choice
 * that fails later.
 *
 * Suggestions are only made when the owner asks (or adds a wave), so a match
 * the owner removed stays removed. The document autosaves like the builder's.
 */
export function MatchingEditor({
    comparisonId,
    initialDocument,
    initialVersion,
    group
}: {
    readonly comparisonId: ComparisonId;
    /** Rows in the order they should stay in for this session. */
    readonly initialDocument: ComparisonDocument;
    readonly initialVersion: number;
    /** Every wave of the group, oldest first. */
    readonly group: readonly GroupWave[];
}) {
    const t = useTranslations("Waves.matches");
    const tCommon = useTranslations("Common");
    const waveName = useWaveName();
    const editor = useComparisonEditor({
        comparisonId,
        initialDocument,
        initialVersion
    });
    const { document, dispatch } = editor;
    const [incompleteOnly, setIncompleteOnly] = useState(false);
    const [removing, setRemoving] = useState<GroupWave | null>(null);

    const comparisonWaves = useMemo(() => toComparisonWaves(group), [group]);
    const waves = group.filter(wave =>
        document.surveyIds.includes(wave.surveyId)
    );
    const addable = group.filter(
        wave => !document.surveyIds.includes(wave.surveyId)
    );
    const atCapacity = document.surveyIds.length >= MAX_COMPARED_WAVES;

    const heldBy = useMemo(() => {
        const held = new Map<QuestionId, ComparisonRowId>();
        for (const row of document.rows) {
            for (const match of row.matches) held.set(match.questionId, row.id);
        }
        return held;
    }, [document.rows]);

    const incomplete = new Set(incompleteRows(document).map(row => row.id));
    const shownRows = incompleteOnly
        ? document.rows.filter(row => incomplete.has(row.id))
        : document.rows;
    const unmatched = unmatchedQuestions(comparisonWaves, document).filter(
        entry => entry.questions.length > 0
    );

    const cannotAdd = atCapacity
        ? t("addWaveFull", { max: MAX_COMPARED_WAVES })
        : addable.length === 0
          ? t("noWaveToAdd")
          : null;
    const addWave = (
        <Button
            variant="outline"
            size="sm"
            disabled={cannotAdd !== null}
            className="h-[30px] rounded-lg text-xs"
        >
            <Plus aria-hidden />
            {t("addWave")}
        </Button>
    );

    const colour = (surveyId: SurveyId) =>
        `var(--chart-${document.surveyIds.indexOf(surveyId) + 1})`;

    return (
        <>
            <AppBar
                constrained
                title={document.name}
                metaOnNarrow
                meta={
                    <SaveIndicator
                        status={editor.status}
                        onRetry={editor.retry}
                    />
                }
                actions={
                    <Button
                        asChild
                        size="sm"
                        className="h-[30px] rounded-lg text-xs"
                    >
                        <Link href={ROUTES.comparison(comparisonId)}>
                            {t("done")}
                        </Link>
                    </Button>
                }
            />

            <div className={cn("flex flex-col gap-3 p-4", PAGE_WIDTH)}>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            dispatch({
                                kind: "suggest",
                                group: comparisonWaves
                            })
                        }
                        className="h-[30px] rounded-lg text-xs"
                    >
                        <Sparkles aria-hidden />
                        {t("suggest")}
                    </Button>

                    <DropdownMenu>
                        {cannotAdd === null ? (
                            <DropdownMenuTrigger asChild>
                                {addWave}
                            </DropdownMenuTrigger>
                        ) : (
                            // A disabled button swallows pointer events, so the
                            // tooltip hangs on a wrapper that does not.
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span tabIndex={0}>{addWave}</span>
                                </TooltipTrigger>
                                <TooltipContent>{cannotAdd}</TooltipContent>
                            </Tooltip>
                        )}
                        <DropdownMenuContent
                            align="start"
                            className="rounded-lg"
                        >
                            {addable.map(wave => (
                                <DropdownMenuItem
                                    key={wave.surveyId}
                                    className="rounded-lg text-xs"
                                    onSelect={() =>
                                        dispatch({
                                            kind: "addWave",
                                            surveyId: wave.surveyId,
                                            group: comparisonWaves
                                        })
                                    }
                                >
                                    {waveName(wave)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="ml-auto flex items-center gap-2">
                        <Switch
                            id="matches-incomplete-only"
                            size="sm"
                            checked={incompleteOnly}
                            onCheckedChange={setIncompleteOnly}
                        />
                        <Label
                            htmlFor="matches-incomplete-only"
                            className="text-xs font-normal"
                        >
                            {t("onlyIncomplete")}
                        </Label>
                    </div>
                </div>

                {/* The column heads: which wave each select belongs to, and the
                    way to take a wave out. Below `md` they wrap as a strip of
                    their own and every select carries its own caption. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:flex-nowrap md:gap-2 md:px-3">
                    {waves.map(wave => (
                        <div
                            key={wave.surveyId}
                            className="flex min-w-0 items-center gap-1.5 md:flex-1"
                        >
                            <span
                                aria-hidden
                                style={{ background: colour(wave.surveyId) }}
                                className="inline-block h-2.5 w-4 shrink-0 rounded-xs border"
                            />
                            <span className={cn(LABEL, "truncate")}>
                                {waveName(wave)}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("removeWave", {
                                    wave: waveName(wave)
                                })}
                                onClick={() => setRemoving(wave)}
                                className="size-6 rounded-lg text-muted-foreground"
                            >
                                <X aria-hidden />
                            </Button>
                        </div>
                    ))}
                    <div aria-hidden className="hidden w-8 shrink-0 md:block" />
                </div>

                {document.rows.length === 0 ? (
                    <Card className="gap-3 rounded-xl px-4 py-3.5">
                        <EmptyState
                            title={t("empty.title")}
                            body={t("empty.body")}
                            preview={
                                <>
                                    <EmptyStateRow />
                                    <EmptyStateRow />
                                </>
                            }
                        />
                    </Card>
                ) : shownRows.length === 0 ? (
                    <p className="px-3 text-xs leading-[1.35] text-muted-foreground">
                        {t("noneIncomplete")}
                    </p>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {shownRows.map(row => (
                            <li key={row.id}>
                                <RowEditor
                                    row={row}
                                    index={document.rows.indexOf(row) + 1}
                                    waves={waves}
                                    comparisonWaves={comparisonWaves}
                                    heldBy={heldBy}
                                    dispatch={dispatch}
                                />
                            </li>
                        ))}
                    </ol>
                )}

                <div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            dispatch({
                                kind: "addRow",
                                id: newComparisonRowId()
                            })
                        }
                        className="h-[30px] rounded-lg text-xs"
                    >
                        <Plus aria-hidden />
                        {t("addRow")}
                    </Button>
                </div>

                {unmatched.length > 0 && (
                    <Card className="gap-3 rounded-xl px-4 py-3.5">
                        <h2 className="text-[13px] leading-[1.2] font-semibold">
                            {t("unmatchedTitle")}
                        </h2>
                        {unmatched.map(entry => {
                            const wave = waves.find(
                                w => w.surveyId === entry.surveyId
                            );
                            if (wave === undefined) return null;
                            return (
                                <UnmatchedList
                                    key={entry.surveyId}
                                    wave={wave}
                                    colour={colour(wave.surveyId)}
                                    questions={entry.questions}
                                    dispatch={dispatch}
                                />
                            );
                        })}
                    </Card>
                )}
            </div>

            <AlertDialog
                open={removing !== null}
                onOpenChange={open => {
                    if (!open) setRemoving(null);
                }}
            >
                <AlertDialogContent className="gap-3 rounded-lg p-3.5 sm:max-w-md">
                    <AlertDialogHeader className="gap-1">
                        <AlertDialogTitle className="text-[13px] leading-[1.2] font-semibold">
                            {t("removeWaveTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs leading-[1.35]">
                            {removing !== null &&
                                t("removeWaveBody", {
                                    wave: waveName(removing)
                                })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="h-[30px] rounded-lg text-xs">
                            {tCommon("cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (removing !== null) {
                                    dispatch({
                                        kind: "removeWave",
                                        surveyId: removing.surveyId
                                    });
                                }
                            }}
                            className="h-[30px] rounded-lg text-xs"
                        >
                            {t("removeWaveSubmit")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/** A wave's answerable questions, numbered as the owner sees them in it. */
function numbered(wave: GroupWave): readonly {
    readonly position: number;
    readonly question: AnswerableQuestion;
}[] {
    return wave.elements
        .filter(isAnswerableElement)
        .map((question, index) => ({ position: index + 1, question }));
}

function RowEditor({
    row,
    index,
    waves,
    comparisonWaves,
    heldBy,
    dispatch
}: {
    readonly row: ComparisonRow;
    readonly index: number;
    /** The compared waves, oldest first. */
    readonly waves: readonly GroupWave[];
    readonly comparisonWaves: readonly ComparisonWave[];
    readonly heldBy: ReadonlyMap<QuestionId, ComparisonRowId>;
    readonly dispatch: (action: EditorAction) => void;
}) {
    const t = useTranslations("Waves.matches");
    const waveName = useWaveName();
    const typeName = useElementTypeName();

    const members = rowQuestions(comparisonWaves, row);
    const verdictIn = (
        surveyId: SurveyId,
        candidate: AnswerableQuestion
    ): MatchVerdict =>
        rowVerdict([
            ...members
                .filter(member => member.surveyId !== surveyId)
                .map(member => member.question),
            candidate
        ]);

    return (
        <Card
            aria-label={t("rowLabel", { index })}
            role="group"
            className="gap-2 rounded-lg px-3 py-2.5"
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                {waves.map(wave => {
                    const current = row.matches.find(
                        match => match.surveyId === wave.surveyId
                    );
                    const questions = numbered(wave);
                    const chosen = questions.find(
                        entry => entry.question.id === current?.questionId
                    );
                    const selectId = `row-${row.id}-${wave.surveyId}`;

                    return (
                        <div
                            key={wave.surveyId}
                            className="flex min-w-0 flex-col gap-1 md:flex-1"
                        >
                            <Label
                                htmlFor={selectId}
                                className={cn(LABEL, "md:sr-only")}
                            >
                                {t("waveSelect", { wave: waveName(wave) })}
                            </Label>
                            <div className="flex min-w-0 items-center gap-1">
                                <Select
                                    value={current?.questionId ?? ""}
                                    onValueChange={value => {
                                        const picked = questions.find(
                                            entry => entry.question.id === value
                                        );
                                        if (picked === undefined) return;
                                        dispatch({
                                            kind: "setMatch",
                                            rowId: row.id,
                                            surveyId: wave.surveyId,
                                            questionId: picked.question.id
                                        });
                                    }}
                                >
                                    <SelectTrigger
                                        id={selectId}
                                        size="sm"
                                        className="w-full min-w-0 rounded-lg text-xs"
                                    >
                                        <SelectValue
                                            placeholder={t("notInWave")}
                                        >
                                            <span className="truncate">
                                                {chosen === undefined
                                                    ? t("removedQuestion")
                                                    : `${chosen.position}. ${chosen.question.title}`}
                                            </span>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent
                                        position="popper"
                                        className="max-w-[min(32rem,var(--radix-select-content-available-width))] rounded-lg"
                                    >
                                        {questions.map(
                                            ({ position, question }) => {
                                                const allowed = verdictIn(
                                                    wave.surveyId,
                                                    question
                                                ).ok;
                                                const holder = heldBy.get(
                                                    question.id
                                                );
                                                const elsewhere =
                                                    allowed &&
                                                    holder !== undefined &&
                                                    holder !== row.id;
                                                return (
                                                    <SelectItem
                                                        key={question.id}
                                                        value={question.id}
                                                        disabled={!allowed}
                                                        className="rounded-lg text-xs"
                                                    >
                                                        <span className="flex min-w-0 flex-col items-start gap-1">
                                                            <span className="flex min-w-0 items-baseline gap-1.5">
                                                                <span className="truncate">
                                                                    {`${position}. ${question.title}`}
                                                                </span>
                                                                <span
                                                                    className={cn(
                                                                        TAG,
                                                                        "shrink-0 text-muted-foreground"
                                                                    )}
                                                                >
                                                                    {typeName(
                                                                        question.type
                                                                    )}
                                                                </span>
                                                            </span>
                                                            {elsewhere && (
                                                                <span
                                                                    className={cn(
                                                                        META,
                                                                        "text-muted-foreground"
                                                                    )}
                                                                >
                                                                    {t(
                                                                        "inOtherRow"
                                                                    )}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </SelectItem>
                                                );
                                            }
                                        )}
                                    </SelectContent>
                                </Select>
                                {current !== undefined && (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={t("clear", {
                                            wave: waveName(wave)
                                        })}
                                        onClick={() =>
                                            dispatch({
                                                kind: "setMatch",
                                                rowId: row.id,
                                                surveyId: wave.surveyId,
                                                questionId: null
                                            })
                                        }
                                        className="size-7 shrink-0 rounded-lg text-muted-foreground"
                                    >
                                        <X aria-hidden />
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}

                <div className="flex shrink-0 items-center justify-end self-end md:w-8 md:self-auto">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("removeRow")}
                        onClick={() =>
                            dispatch({ kind: "removeRow", rowId: row.id })
                        }
                        className="rounded-lg text-muted-foreground"
                    >
                        <Trash2 aria-hidden />
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function UnmatchedList({
    wave,
    colour,
    questions,
    dispatch
}: {
    readonly wave: GroupWave;
    readonly colour: string;
    readonly questions: readonly AnswerableQuestion[];
    readonly dispatch: (action: EditorAction) => void;
}) {
    const t = useTranslations("Waves.matches");
    const waveName = useWaveName();
    const typeName = useElementTypeName();
    const position = new Map(
        numbered(wave).map(entry => [entry.question.id, entry.position])
    );

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
                <span
                    aria-hidden
                    style={{ background: colour }}
                    className="inline-block h-2.5 w-4 rounded-xs border"
                />
                <span className={LABEL}>{waveName(wave)}</span>
            </div>
            <ul className="flex flex-col divide-y rounded-lg border">
                {questions.map(question => (
                    <li
                        key={question.id}
                        className="flex min-h-9 items-center gap-2 px-2.5 py-1"
                    >
                        <span className="min-w-0 flex-1 truncate text-xs">
                            {`${position.get(question.id) ?? ""}. ${question.title}`}
                        </span>
                        <span
                            className={cn(
                                TAG,
                                "shrink-0 text-muted-foreground"
                            )}
                        >
                            {typeName(question.type)}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                dispatch({
                                    kind: "addRow",
                                    id: newComparisonRowId(),
                                    match: {
                                        surveyId: wave.surveyId,
                                        questionId: question.id
                                    }
                                })
                            }
                            className="h-[26px] shrink-0 rounded-lg px-2 text-xs"
                        >
                            <Plus aria-hidden />
                            {t("addAsRow")}
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
