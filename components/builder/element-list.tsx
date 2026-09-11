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
import { GripVertical, Heading, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ELEMENT_ICONS } from "@/components/builder/element-type";
import { PanelHeader } from "@/components/builder/panel";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip";
import type { QuestionId } from "@/domain/ids";
import type { BuilderSelection } from "@/lib/builder/document";
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

/**
 * The one thing this row says beyond the element's name: that some of it has
 * no text in the language being edited.
 *
 * A marked-but-unexplained row is worse than none — a dot says *something is
 * different about this one* and leaves the author to guess what — so the mark
 * is an icon that already reads as a caution and carries the sentence with it.
 * It is deliberately quiet: an untranslated question is a normal state on the
 * way to a finished translation, not an error, and it falls back rather than
 * breaking anything.
 *
 * `asChild` on a plain span, because this sits inside the row's button and a
 * button inside a button is not valid HTML. The tooltip is therefore
 * hover-only, which is why the sentence is also in the accessible name.
 */
function UntranslatedMark() {
    const t = useTranslations("Builder.translation");

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="shrink-0 text-muted-foreground">
                    <TriangleAlert aria-hidden className="size-3.5" />
                    <span className="sr-only">{t("rowUntranslated")}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="right">{t("rowUntranslated")}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Icon, name, and the untranslated mark. Takes them rather than an element,
 * because the first row of this list is the survey's own header block, which
 * has no `type` to look an icon up by.
 */
function RowContent({
    icon: Icon,
    title,
    untranslated
}: {
    readonly icon: LucideIcon;
    readonly title: string;
    /** Something here has no text in the language being edited. */
    readonly untranslated: boolean;
}) {
    return (
        <>
            <Icon aria-hidden className="size-3.5 shrink-0 text-input" />
            <span className="min-w-0 flex-1 truncate text-xs leading-none">
                {title}
            </span>
            {untranslated && <UntranslatedMark />}
        </>
    );
}

/**
 * The survey's own title and intro, as the first row of the list.
 *
 * Above question 1 and outside the sortable context: it is the head, it is
 * always there and it never moves. Keeping it out of `elements` is also what
 * keeps every drag index honest — the reorder handlers below index into that
 * array, so a row prepended to it would land every drop one position out.
 *
 * It keeps `ROW`'s `pl-7` despite having no drag handle in that gutter, so its
 * icon lines up with the questions beneath it.
 */
function HeadRow({
    title,
    selected,
    untranslated,
    onSelect
}: {
    readonly title: string;
    readonly selected: boolean;
    readonly untranslated: boolean;
    readonly onSelect: () => void;
}) {
    return (
        <div className="border-b p-2">
            <button
                type="button"
                onClick={onSelect}
                aria-current={selected}
                className={cn(
                    ROW,
                    "hover:bg-muted focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none",
                    selected &&
                        "bg-muted font-medium shadow-[inset_2px_0_0_var(--primary)]"
                )}
            >
                <RowContent
                    icon={Heading}
                    title={title}
                    untranslated={untranslated}
                />
            </button>
        </div>
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
                    icon={ELEMENT_ICONS[element.type]}
                    title={element.title}
                    untranslated={untranslated}
                />
            </button>
        </li>
    );
}

export function ElementList({
    elements,
    selectedId,
    headTitle,
    headSelected,
    headUntranslated,
    onSelectHead,
    untranslated,
    onSelect,
    onMove,
    className
}: {
    readonly elements: readonly SurveyElement[];
    readonly selectedId: BuilderSelection;
    /** The survey's own name, resolved — what the head row shows. */
    readonly headTitle: string;
    readonly headSelected: boolean;
    /** The head has text with no translation in the language being edited. */
    readonly headUntranslated: boolean;
    readonly onSelectHead: () => void;
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
                // Still the question count: the head is not one of them.
                meta={t("elements.count", { count: elements.length })}
            />

            {/* Outside the branch below, so a survey with no questions yet
                still shows its own title rather than an empty panel. */}
            <HeadRow
                title={headTitle}
                selected={headSelected}
                untranslated={headUntranslated}
                onSelect={onSelectHead}
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
                                    icon={ELEMENT_ICONS[dragging.type]}
                                    title={dragging.title}
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
