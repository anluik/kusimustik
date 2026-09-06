"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { ElementPreview } from "@/components/builder/element-preview";
import { useElementTypeName } from "@/components/builder/element-type";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { QuestionId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import { cn } from "@/lib/utils";

/**
 * The centre panel: the survey as the respondent will meet it, and the second
 * way to select an element.
 *
 * The card is a `div` with a transparent button laid over it rather than a
 * `button` wrapping everything, because the preview inside will grow controls
 * of its own as the remaining question types land, and nesting those in a
 * button is invalid. The overlay is the last child, so it takes the clicks
 * without the content having to opt out of them.
 */

function CanvasCard({
    element,
    position,
    selected,
    onSelect
}: {
    readonly element: SurveyElement;
    readonly position: number;
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
                    <div className="flex items-baseline gap-2">
                        <span className="shrink-0 font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
                            {position}
                        </span>
                        <h3 className="text-[15px] leading-[1.4] font-medium">
                            {element.title}
                        </h3>
                    </div>
                    {element.description !== undefined && (
                        <p className="text-xs leading-[1.35] text-muted-foreground">
                            {element.description}
                        </p>
                    )}
                    {element.isAnswerable && element.required && (
                        <span className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                            {t("required")}
                        </span>
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
    elements,
    selectedId,
    onSelect,
    className
}: {
    readonly elements: readonly SurveyElement[];
    readonly selectedId: QuestionId | null;
    readonly onSelect: (id: QuestionId) => void;
    readonly className?: string;
}) {
    const t = useTranslations("Builder.canvas");
    const listRef = useRef<HTMLDivElement>(null);

    // Selecting happens in the element list as often as here, and a canvas that
    // does not move when it does looks like nothing happened. `nearest` leaves
    // a card that is already on screen exactly where it is.
    useEffect(() => {
        if (selectedId === null) return;
        listRef.current
            ?.querySelector(`[data-element-id="${selectedId}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [selectedId]);

    return (
        <div ref={listRef} className={cn("min-w-0 overflow-y-auto", className)}>
            {elements.length === 0 ? (
                <div className="mx-auto w-full max-w-[640px] p-4">
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
                </div>
            ) : (
                <ul className="mx-auto flex w-full max-w-[640px] flex-col gap-3 p-4">
                    {elements.map((element, index) => (
                        <CanvasCard
                            key={element.id}
                            element={element}
                            position={index + 1}
                            selected={element.id === selectedId}
                            onSelect={() => onSelect(element.id)}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
