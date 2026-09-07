"use client";

import { PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { ExportButton } from "@/components/results/export-button";
import { FunnelPanel } from "@/components/results/funnel-panel";
import { QuestionCard } from "@/components/results/question-card";
import { ResponsesTable } from "@/components/results/responses-table";
import { StatRow } from "@/components/results/stat-row";
import { AppBar } from "@/components/shell/app-bar";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import type { SurveyStatus } from "@/domain/survey";
import type { FunnelTotals } from "@/lib/db/funnel";
import type { ResponseRecord } from "@/lib/db/responses";
import { buildFunnel } from "@/lib/results/funnel";
import type { QuestionFunnelRow } from "@/lib/db/funnel";
import { buildResponseRows } from "@/lib/results/response-table";
import { buildQuestionResults } from "@/lib/results/summary";
import { ROUTES } from "@/lib/routes";

/**
 * The results surface: three tabs over one server render.
 *
 * Everything is shaped here rather than on the server because the shaping is
 * pure and cheap and the page already has the rows — a second round trip per
 * tab would buy nothing. The one live thing is the response count, which owns
 * its own subscription inside `StatRow`.
 *
 * DESIGN §5: the sub-tabs are pill style on `bg-muted`.
 */
export function ResultsScreen({
    surveyId,
    title,
    status,
    elements,
    responses,
    totals,
    questionFunnel
}: {
    readonly surveyId: SurveyId;
    readonly title: string;
    readonly status: SurveyStatus;
    readonly elements: readonly SurveyElement[];
    readonly responses: readonly ResponseRecord[];
    readonly totals: FunnelTotals;
    readonly questionFunnel: readonly QuestionFunnelRow[];
}) {
    const t = useTranslations("Results");

    const results = useMemo(
        () => buildQuestionResults(elements, responses),
        [elements, responses]
    );
    const rows = useMemo(
        () => buildResponseRows(elements, responses),
        [elements, responses]
    );
    const funnel = useMemo(
        () =>
            buildFunnel(
                elements,
                totals,
                new Map(questionFunnel.map(row => [row.questionId, row]))
            ),
        [elements, totals, questionFunnel]
    );

    // The headline "how long does a question take" figure: the median of the
    // per-question medians, which is a summary of the survey rather than of any
    // one question and is why it is computed here and not in the funnel.
    const medianDwellMs = useMemo(() => {
        const measured = funnel.stages
            .map(stage => stage.medianDwellMs)
            .filter((value): value is number => value !== null)
            .sort((a, b) => a - b);
        if (measured.length === 0) return null;
        const middle = Math.floor(measured.length / 2);
        const upper = measured[middle];
        if (upper === undefined) return null;
        const lower = measured[middle - 1];
        return measured.length % 2 === 1 || lower === undefined
            ? upper
            : Math.round((lower + upper) / 2);
    }, [funnel]);

    const hasResponses = responses.length > 0;

    return (
        <>
            <AppBar
                title={title}
                meta={t("title")}
                actions={
                    <>
                        <ExportButton
                            surveyId={surveyId}
                            enabled={hasResponses}
                        />
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-[30px] rounded text-xs"
                        >
                            <Link href={ROUTES.builder(surveyId)}>
                                <PencilLine aria-hidden />
                                {t("backToBuilder")}
                            </Link>
                        </Button>
                    </>
                }
            />

            <div className="flex flex-col gap-3 p-4">
                <StatRow
                    surveyId={surveyId}
                    responseCount={responses.length}
                    totals={totals}
                    medianDwellMs={medianDwellMs}
                />

                <Tabs defaultValue="questions" className="gap-3">
                    <TabsList className="h-8 w-fit rounded bg-muted p-0.5">
                        {(["questions", "responses", "behaviour"] as const).map(
                            tab => (
                                <TabsTrigger
                                    key={tab}
                                    value={tab}
                                    className="h-7 rounded px-3 text-xs"
                                >
                                    {t(`tabs.${tab}`)}
                                </TabsTrigger>
                            )
                        )}
                    </TabsList>

                    <TabsContent
                        value="questions"
                        className="flex flex-col gap-3"
                    >
                        {!hasResponses ? (
                            <NoResponses status={status} surveyId={surveyId} />
                        ) : (
                            results.map((result, index) => (
                                <QuestionCard
                                    key={result.question.id}
                                    question={result.question}
                                    summary={result.summary}
                                    position={index + 1}
                                />
                            ))
                        )}
                    </TabsContent>

                    <TabsContent value="responses">
                        {!hasResponses ? (
                            <NoResponses
                                status={status}
                                surveyId={surveyId}
                                variant="responses"
                            />
                        ) : (
                            <ResponsesTable elements={elements} rows={rows} />
                        )}
                    </TabsContent>

                    <TabsContent value="behaviour">
                        <FunnelPanel funnel={funnel} surveyId={surveyId} />
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}

/**
 * A draft that has never collected anything and a published survey waiting for
 * its first response are different situations with different next actions, so
 * they get different copy. DESIGN §6: never an illustration, always one line
 * naming what is missing and one explaining what unblocks it.
 */
function NoResponses({
    status,
    surveyId,
    variant = "questions"
}: {
    readonly status: SurveyStatus;
    readonly surveyId: SurveyId;
    readonly variant?: "questions" | "responses";
}) {
    const t = useTranslations("Results.empty");
    const tResults = useTranslations("Results");

    const key = status === "draft" ? "draft" : variant;

    return (
        <Card className="gap-3 rounded px-3.5 py-3">
            <EmptyState
                title={t(`${key}.title`)}
                body={t(`${key}.body`)}
                preview={
                    <>
                        <EmptyStateRow />
                        <EmptyStateRow />
                        <EmptyStateRow />
                    </>
                }
                actions={
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-[30px] rounded text-xs"
                    >
                        <Link href={ROUTES.builder(surveyId)}>
                            {tResults("backToBuilder")}
                        </Link>
                    </Button>
                }
            />
        </Card>
    );
}
