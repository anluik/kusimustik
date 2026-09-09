"use client";

import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type Announcements,
    type DragEndEvent,
    type DragStartEvent
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ELEMENT_ICONS } from "@/components/builder/element-type";
import { PanelHeader } from "@/components/builder/panel";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import type { QuestionId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import { cn } from "@/lib/utils";

/**
 * The element list: what the survey contains, in the order a respondent meets
 * it, and the only place the order can be changed.
 *
 * DESIGN.md §5 asks for a drop indicator — a 2px primary rule with a dot —
 * and explicitly *not* row displacement, so the sortable transforms are
 * ignored rather than applied: the rows hold still, a `DragOverlay` follows
 * the pointer, and the rule shows where the row would land. See
 * docs/DECISIONS.md 014.
 */

/** DESIGN §4: a dense row is 32px, and the drag handle may go to 28. */
const ROW = "flex h-8 w-full items-center gap-2 rounded pr-2 pl-7 text-left";

function RowContent({
    element,
    position,
    untranslated
}: {
    readonly element: SurveyElement;
    readonly position: number;
    /** Something on this element has no text in the language being edited. */
    readonly untranslated: boolean;
}) {
    const t = useTranslations("Builder");
    const Icon = ELEMENT_ICONS[element.type];

    return (
        <>
            <Icon aria-hidden className="size-3.5 shrink-0 text-input" />
            <span className="min-w-0 flex-1 truncate text-xs leading-none">
                {element.title}
            </span>
            {/* A dot rather than a count: the row is 32px and already carries
                an icon, a title and a position. The count for the whole
                language is beside the switcher, where there is room for it.
                DESIGN §6 — colour is never the only encoding — is why it
                carries a name for screen readers. */}
            {untranslated && (
                <span
                    title={t("translation.rowUntranslated")}
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                >
                    <span className="sr-only">
                        {t("translation.rowUntranslated")}
                    </span>
                </span>
            )}
            <span className="shrink-0 font-mono text-[10px] leading-none text-muted-foreground tabular-nums">
                {position}
            </span>
        </>
    );
}

/** DESIGN §5: 2px primary rule plus a 5px dot, drawn between the rows. */
function DropRule({ edge }: { readonly edge: "top" | "bottom" }) {
    return (
        <span
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-x-0 z-10 flex h-0.5 items-center bg-primary",
                edge === "top" ? "-top-px" : "-bottom-px"
            )}
        >
            <span className="-ml-px size-[5px] rounded-full bg-primary" />
        </span>
    );
}

function ElementRow({
    element,
    selected,
    untranslated,
    onSelect
}: {
    readonly element: SurveyElement;
    readonly selected: boolean;
    readonly untranslated: boolean;
    readonly onSelect: () => void;
}) {
    const t = useTranslations("Builder");
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        isDragging,
        activeIndex,
        overIndex,
        index
    } = useSortable({ id: element.id });

    // `activeIndex` is -1 unless something is being dragged; a row is the drop
    // target when the pointer is over it and it is not the row being dragged.
    const isTarget = activeIndex !== -1 && overIndex === index;
    const edge =
        !isTarget || activeIndex === index
            ? null
            : activeIndex > index
              ? "top"
              : "bottom";

    return (
        <li ref={setNodeRef} className="relative">
            {edge !== null && <DropRule edge={edge} />}

            {/* The handle and the row are siblings rather than nested: a
                button inside a button is not valid HTML, and the handle has to
                be a button to be reachable by keyboard. */}
            <button
                ref={setActivatorNodeRef}
                type="button"
                aria-label={t("elements.dragHandle", { title: element.title })}
                className="absolute top-0 left-0 z-10 flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-input focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical aria-hidden className="size-3.5" />
            </button>

            <button
                type="button"
                onClick={onSelect}
                aria-current={selected}
                className={cn(
                    ROW,
                    "hover:bg-muted focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none",
                    selected &&
                        "bg-muted font-medium shadow-[inset_2px_0_0_var(--primary)]",
                    // The row being dragged stays in place as the gap the
                    // overlay came out of.
                    isDragging && "text-input"
                )}
            >
                <RowContent
                    element={element}
                    position={index + 1}
                    untranslated={untranslated}
                />
            </button>
        </li>
    );
}

export function ElementList({
    elements,
    selectedId,
    untranslated,
    onSelect,
    onMove,
    className
}: {
    readonly elements: readonly SurveyElement[];
    readonly selectedId: QuestionId | null;
    /** Elements with something still to translate; empty unless translating. */
    readonly untranslated: ReadonlySet<QuestionId>;
    readonly onSelect: (id: QuestionId) => void;
    readonly onMove: (id: QuestionId, to: number) => void;
    readonly className?: string;
}) {
    const t = useTranslations("Builder");
    const [dragging, setDragging] = useState<SurveyElement | null>(null);

    const sensors = useSensors(
        // A few pixels of travel before a drag starts, so that clicking a row
        // to select it is not read as the beginning of one.
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const byId = (id: string | number) =>
        elements.find(element => element.id === id) ?? null;
    const positionOf = (id: string | number | undefined) =>
        elements.findIndex(element => element.id === id) + 1;

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            t("dnd.onDragStart", {
                title: byId(active.id)?.title ?? "",
                position: positionOf(active.id)
            }),
        onDragOver: ({ active, over }) =>
            t("dnd.onDragOver", {
                title: byId(active.id)?.title ?? "",
                position: positionOf(over?.id)
            }),
        onDragEnd: ({ active, over }) =>
            t("dnd.onDragEnd", {
                title: byId(active.id)?.title ?? "",
                position: positionOf(over?.id)
            }),
        onDragCancel: ({ active }) =>
            t("dnd.onDragCancel", {
                title: byId(active.id)?.title ?? "",
                position: positionOf(active.id)
            })
    };

    function onDragStart(event: DragStartEvent) {
        setDragging(byId(event.active.id));
    }

    function onDragEnd(event: DragEndEvent) {
        setDragging(null);

        const { active, over } = event;
        if (over === null) return;

        const moved = byId(active.id);
        const to = elements.findIndex(element => element.id === over.id);
        if (moved === null || to === -1) return;

        onMove(moved.id, to);
    }

    return (
        <div className={cn("flex min-h-0 flex-col bg-sidebar", className)}>
            <PanelHeader
                title={t("elements.title")}
                meta={t("elements.count", { count: elements.length })}
            />

            {elements.length === 0 ? (
                <EmptyState
                    title={t("elements.empty.title")}
                    body={t("elements.empty.body")}
                    preview={
                        <>
                            <EmptyStateRow />
                            <EmptyStateRow />
                        </>
                    }
                />
            ) : (
                <DndContext
                    // Not decoration: dnd-kit numbers its own ids from a module
                    // counter, so the `aria-describedby` it puts on every handle
                    // comes out different on the server and on the client and
                    // the whole tree fails to hydrate. Naming the context pins
                    // it. See docs/DECISIONS.md 014.
                    id="survey-element-list"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    accessibility={{
                        announcements,
                        screenReaderInstructions: {
                            draggable: t("dnd.instructions")
                        }
                    }}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setDragging(null)}
                >
                    <SortableContext
                        items={elements.map(element => element.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <ul className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2">
                            {elements.map(element => (
                                <ElementRow
                                    key={element.id}
                                    element={element}
                                    selected={element.id === selectedId}
                                    untranslated={untranslated.has(element.id)}
                                    onSelect={() => onSelect(element.id)}
                                />
                            ))}
                        </ul>
                    </SortableContext>

                    <DragOverlay dropAnimation={null}>
                        {dragging !== null && (
                            <div
                                className={cn(
                                    ROW,
                                    "cursor-grabbing border border-primary bg-card shadow-sm"
                                )}
                            >
                                <RowContent
                                    element={dragging}
                                    position={
                                        elements.findIndex(
                                            element =>
                                                element.id === dragging.id
                                        ) + 1
                                    }
                                    untranslated={untranslated.has(dragging.id)}
                                />
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            )}
        </div>
    );
}
