"use client";

import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    restrictToParentElement,
    restrictToVerticalAxis
} from "@dnd-kit/modifiers";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { EditorSection } from "@/components/builder/element-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChoiceOption } from "@/domain/question";
import { moveItem } from "@/lib/builder/document";
import { newOption } from "@/lib/builder/new-element";

/**
 * A list of choices — a question's options, or a matrix's rows and columns —
 * with reordering, renaming, adding and removing.
 *
 * Option *values* are never touched here: an answer stores the value, so
 * rewording or reordering an option must leave the answers already given to it
 * alone. That is also why the rows are keyed and sorted by `value` rather than
 * by position.
 *
 * Unlike the element list, these rows *do* displace as they are dragged. There
 * the design asks for a stationary list with a drop rule (docs/DECISIONS.md
 * 014); here the list is a handful of short rows inside a panel, where the
 * ordinary sortable transform is legible and needs no overlay.
 */

export type ChoiceListCopy = {
    readonly section: string;
    readonly item: (index: number) => string;
    readonly placeholder: string;
    readonly add: string;
    readonly remove: (index: number) => string;
    readonly reorder: (index: number) => string;
};

/** The three lists' copy, so an editor names the one it needs and no more. */
export function useChoiceListCopy(): Record<
    "options" | "rows" | "columns",
    ChoiceListCopy
> {
    const t = useTranslations("Builder.editor");

    return {
        options: {
            section: t("optionsLabel"),
            item: index => t("optionLabel", { index }),
            placeholder: t("optionPlaceholder"),
            add: t("addOption"),
            remove: index => t("removeOption", { index }),
            reorder: index => t("reorderOption", { index })
        },
        rows: {
            section: t("rowsLabel"),
            item: index => t("rowLabel", { index }),
            placeholder: t("rowPlaceholder"),
            add: t("addRow"),
            remove: index => t("removeRow", { index }),
            reorder: index => t("reorderRow", { index })
        },
        columns: {
            section: t("columnsLabel"),
            item: index => t("columnLabel", { index }),
            placeholder: t("columnPlaceholder"),
            add: t("addColumn"),
            remove: index => t("removeColumn", { index }),
            reorder: index => t("reorderColumn", { index })
        }
    };
}

function OptionRow({
    option,
    index,
    copy,
    error,
    removable,
    inputRef,
    onRename,
    onRemove
}: {
    readonly option: ChoiceOption;
    readonly index: number;
    readonly copy: ChoiceListCopy;
    readonly error: string | undefined;
    readonly removable: boolean;
    /** Set only on a row that was just added, to put the caret in it. */
    readonly inputRef?: (node: HTMLInputElement | null) => void;
    readonly onRename: (label: string) => void;
    readonly onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: option.value });

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={
                isDragging
                    ? "relative z-10 flex flex-col gap-1"
                    : "flex flex-col gap-1"
            }
        >
            <div className="flex items-center gap-1">
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    aria-label={copy.reorder(index + 1)}
                    className="flex h-[30px] w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-input focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/18 focus-visible:outline-none active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical aria-hidden className="size-3.5" />
                </button>

                <Input
                    {...(inputRef !== undefined && { ref: inputRef })}
                    value={option.label}
                    aria-label={copy.item(index + 1)}
                    placeholder={copy.placeholder}
                    autoComplete="off"
                    aria-invalid={error !== undefined}
                    onChange={event => onRename(event.currentTarget.value)}
                    className="h-[30px] rounded text-xs"
                />

                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    // The schema has a floor, so the control stays and goes
                    // quiet rather than disappearing (DESIGN §6).
                    disabled={!removable}
                    aria-label={copy.remove(index + 1)}
                    onClick={onRemove}
                    className="shrink-0 rounded text-muted-foreground disabled:cursor-not-allowed disabled:text-input disabled:opacity-100"
                >
                    <X aria-hidden />
                </Button>
            </div>
            {error !== undefined && (
                <p className="pl-5 text-[11px] leading-[1.35] text-destructive">
                    {error}
                </p>
            )}
        </li>
    );
}

export function OptionListEditor({
    dndId,
    options,
    minimum,
    copy,
    onChange
}: {
    /** dnd-kit numbers its contexts from a module counter and the ids it
     *  writes into the DOM must match between server and client, so every
     *  context on the page is named. See docs/DECISIONS.md 014. */
    readonly dndId: string;
    readonly options: readonly ChoiceOption[];
    /** The schema's floor for this list: 2 for options, 1 for matrix rows. */
    readonly minimum: number;
    readonly copy: ChoiceListCopy;
    readonly onChange: (options: readonly ChoiceOption[]) => void;
}) {
    const tErrors = useTranslations("Builder.errors");

    /**
     * Adding an option and then having to aim at the row it created is the
     * most repeated piece of friction in the builder: five options were
     * fifteen actions, and the typing that followed the click went nowhere.
     * The row to focus is named by the click that created it, and the focusing
     * itself happens in a callback ref, which React runs when that row's input
     * mounts — no effect, and nothing to keep in sync with the document. The
     * callback is stable, so the row is focused once, when it appears, and not
     * again on every later render. The default label is selected rather than
     * merely focused, so typing replaces "Valik 3" instead of appending to it.
     */
    const [addedValue, setAddedValue] = useState<string | null>(null);
    const focusOnMount = useCallback((node: HTMLInputElement | null) => {
        if (node === null) return;
        node.focus();
        node.select();
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    function onDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (over === null) return;

        const from = options.findIndex(option => option.value === active.id);
        const to = options.findIndex(option => option.value === over.id);
        if (from === -1 || to === -1 || from === to) return;

        onChange(moveItem(options, from, to));
    }

    return (
        <EditorSection label={copy.section}>
            <DndContext
                id={dndId}
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragEnd={onDragEnd}
            >
                <SortableContext
                    items={options.map(option => option.value)}
                    strategy={verticalListSortingStrategy}
                >
                    <ul className="flex flex-col gap-1.5">
                        {options.map((option, index) => (
                            <OptionRow
                                key={option.value}
                                option={option}
                                index={index}
                                copy={copy}
                                error={
                                    option.label.trim() === ""
                                        ? tErrors("optionRequired")
                                        : undefined
                                }
                                removable={options.length > minimum}
                                {...(option.value === addedValue && {
                                    inputRef: focusOnMount
                                })}
                                onRename={label =>
                                    onChange(
                                        options.map((current, position) =>
                                            position === index
                                                ? { ...current, label }
                                                : current
                                        )
                                    )
                                }
                                onRemove={() =>
                                    onChange(
                                        options.filter(
                                            (_, position) => position !== index
                                        )
                                    )
                                }
                            />
                        ))}
                    </ul>
                </SortableContext>
            </DndContext>

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    const added = newOption(options, copy.item);
                    setAddedValue(added.value);
                    onChange([...options, added]);
                }}
                className="h-[30px] w-full rounded text-xs"
            >
                <Plus aria-hidden />
                {copy.add}
            </Button>
        </EditorSection>
    );
}
