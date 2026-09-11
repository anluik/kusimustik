"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";

import { ElementPreview } from "@/components/builder/element-preview";
import { useElementTypeName } from "@/components/builder/element-type";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { QuestionId } from "@/domain/ids";
import type { SurveyHead } from "@/domain/survey";
import { HEAD } from "@/lib/builder/document";
import type { BuilderSelection } from "@/lib/builder/document";
import { isAnswerableElement, type SurveyElement } from "@/domain/question";
import { cn } from "@/lib/utils";

/**
 * The centre panel: the survey as the respondent will meet it, and the second
 * way to select an element.
 *
 * "As the respondent will meet it" is a promise, and it has to be kept in the
 * details the author would otherwise take on trust. A question's number is the
 * runner's number — statements are not counted there, so a survey that opens
 * with one had every question here one ahead of the link, which is worse than
 * useless to an author writing "answer question 3 first" into their intro. The
 * required and optional markers are the runner's markers, and the words come
 * from the pairs `lib/i18n/messages.test.ts` pins, so the two catalogues
 * cannot drift apart again (docs/DECISIONS.md 020).
 *
 * What it does *not* mirror is the matrix, which the runner stacks and this
 * draws as a grid — deliberately, because the grid is the shape the author is
 * editing (docs/DECISIONS.md 016). The empty state says "roughly" for that
 * reason.
 *
 * The card is a `div` with a transparent button laid over it rather than a
 * `button` wrapping everything, because the preview inside will grow controls
 * of its own as the remaining question types land, and nesting those in a
 * button is invalid. The overlay is the last child, so it takes the clicks
 * without the content having to opt out of them.
 */

/**
 * The survey's own title and intro, drawn as the respondent meets them: first,
 * above every question. It is the only card with no number and no preview —
 * there is nothing to answer — and the only one that cannot be moved.
 *
 * `data-element-id="head"` rather than a second lookup: the sentinel is a
 * string precisely so the scroll-into-view effect below stays one query for
 * both kinds of selection.
 */
function HeadCard({
    head,
    selected,
    onSelect
}: {
    readonly head: SurveyHead;
    readonly selected: boolean;
    readonly onSelect: () => void;
}) {
    const t = useTranslations("Builder.canvas");

    return (
        <li data-element-id={HEAD}>
            <Card
                className={cn(
                    "relative gap-2.5 overflow-visible rounded border py-3 ring-0",
                    selected && "border-primary ring-[3px] ring-ring/18"
                )}
            >
                {selected && (
                    <Badge className="absolute -top-2 left-3 h-4 rounded px-1.5 font-mono text-[9px] leading-none tracking-[0.04em] uppercase">
                        {t("headBadge")}
                    </Badge>
                )}

                <div className="flex flex-col gap-1 px-3">
                    <h2 className="text-[15px] leading-[1.4] font-medium">
                        {head.title}
                    </h2>
                    {head.description !== undefined && (
                        <p className="text-xs leading-[1.35] text-muted-foreground">
                            {head.description}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onSelect}
                    aria-label={head.title}
                    aria-current={selected}
                    className="absolute inset-0 rounded focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                />
            </Card>
        </li>
    );
}

function CanvasCard({
    element,
    position,
    selected,
    onSelect
}: {
    readonly element: SurveyElement;
    /** The runner's own number, or null for a statement, which has none. */
    readonly position: number | null;
    readonly selected: boolean;
    readonly onSelect: () => void;
}) {
    const t = useTranslations("Builder.canvas");
    const typeName = useElementTypeName();

    return (
        <li data-element-id={element.id}>
            <Card
                className={cn(
                    "relative gap-2.5 overflow-visible rounded border py-3 ring-0",
                    selected && "border-primary ring-[3px] ring-ring/18"
                )}
            >
                {selected && (
                    <Badge className="absolute -top-2 left-3 h-4 rounded px-1.5 font-mono text-[9px] leading-none tracking-[0.04em] uppercase">
                        {typeName(element.type)}
                    </Badge>
                )}

                <div className="flex flex-col gap-1 px-3">
                    <h3 className="text-[15px] leading-[1.4] font-medium">
                        {position !== null && (
                            <span className="mr-1.5 font-mono text-muted-foreground tabular-nums">
                                {position}.
                            </span>
                        )}
                        {element.title}
                        {element.isAnswerable &&
                            (element.required ? (
                                <>
                                    <span
                                        aria-hidden
                                        className="ml-1 text-destructive"
                                    >
                                        *
                                    </span>
                                    <span className="sr-only">
                                        {" "}
                                        {t("required")}
                                    </span>
                                </>
                            ) : (
                                <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                                    {t("optional")}
                                </span>
                            ))}
                    </h3>
                    {element.description !== undefined && (
                        <p className="text-xs leading-[1.35] text-muted-foreground">
                            {element.description}
                        </p>
                    )}
                </div>

                <div className="px-3">
                    <ElementPreview element={element} />
                </div>

                <button
                    type="button"
                    onClick={onSelect}
                    aria-label={element.title}
                    aria-current={selected}
                    className="absolute inset-0 rounded focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none"
                />
            </Card>
        </li>
    );
}

export function ElementCanvas({
    head,
    elements,
    selectedId,
    onSelect,
    onSelectHead,
    className
}: {
    /** The survey's own words, resolved: what a respondent would read today. */
    readonly head: SurveyHead;
    readonly elements: readonly SurveyElement[];
    readonly selectedId: BuilderSelection;
    readonly onSelect: (id: QuestionId) => void;
    readonly onSelectHead: () => void;
    readonly className?: string;
}) {
    const t = useTranslations("Builder.canvas");
    const listRef = useRef<HTMLDivElement>(null);

    // The runner numbers what can be answered and nothing else, so this does
    // too — see the note above.
    const positions = useMemo(
        () =>
            new Map(
                elements
                    .filter(isAnswerableElement)
                    .map((element, index) => [element.id, index + 1])
            ),
        [elements]
    );

    // Selecting happens in the element list as often as here, and a canvas that
    // does not move when it does looks like nothing happened. `nearest` leaves
    // a card that is already on screen exactly where it is.
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-element-id="${selectedId}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [selectedId]);

    return (
        <div ref={listRef} className={cn("min-w-0 overflow-y-auto", className)}>
            {/* Always drawn: every survey has a head, so the empty state below
                follows it rather than replacing the whole canvas. An empty
                survey now shows its own title instead of nothing. */}
            <ul className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 pt-4">
                <HeadCard
                    head={head}
                    selected={selectedId === HEAD}
                    onSelect={onSelectHead}
                />
                {elements.map(element => (
                    <CanvasCard
                        key={element.id}
                        element={element}
                        position={positions.get(element.id) ?? null}
                        selected={element.id === selectedId}
                        onSelect={() => onSelect(element.id)}
                    />
                ))}
            </ul>

            <div className="mx-auto w-full max-w-[640px] p-4">
                {elements.length === 0 && (
                    <div className="overflow-hidden rounded border bg-card">
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
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
