"use client";

import { Copy, Trash } from "lucide-react";
import { useTranslations } from "next-intl";

import { DropdownEditor } from "@/components/builder/dropdown-editor";
import { useElementTypeName } from "@/components/builder/element-type";
import { MatrixSingleEditor } from "@/components/builder/matrix-single-editor";
import { MultiChoiceEditor } from "@/components/builder/multi-choice-editor";
import { NpsEditor } from "@/components/builder/nps-editor";
import { OpinionScaleEditor } from "@/components/builder/opinion-scale-editor";
import { PanelHeader } from "@/components/builder/panel";
import { SingleChoiceEditor } from "@/components/builder/single-choice-editor";
import { StatementEditor } from "@/components/builder/statement-editor";
import {
    LongTextEditor,
    ShortTextEditor
} from "@/components/builder/text-editor";
import { EmptyState, EmptyStateRow } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { assertNever } from "@/domain/assert-never";
import type { SurveyElement } from "@/domain/question";
import type { KeyPolicy } from "@/lib/builder/keys";
import { cn } from "@/lib/utils";

/**
 * The right-hand panel: the editor for whichever element is selected, chosen
 * by a switch over `type`.
 *
 * All nine types are handled, each by its own component, and `assertNever`
 * closes the switch — so a tenth type is a build error here and at every other
 * site that switches on the union, which is exactly the property Phase 1 was
 * built for. There is deliberately no shared "choice editor" taking a flag:
 * the types differ in what they *offer* (a written answer, selection bounds, a
 * second list), and a component that branched on `type` internally would be
 * the fallback branch this codebase does not allow, one level down.
 */

function ElementEditor({
    element,
    siblings,
    keyPolicy,
    onChange
}: {
    readonly element: SurveyElement;
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const shared = { siblings, keyPolicy, onChange };

    switch (element.type) {
        case "statement":
            return <StatementEditor element={element} {...shared} />;
        case "single_choice":
            return <SingleChoiceEditor question={element} {...shared} />;
        case "multi_choice":
            return <MultiChoiceEditor question={element} {...shared} />;
        case "dropdown":
            return <DropdownEditor question={element} {...shared} />;
        case "short_text":
            return <ShortTextEditor question={element} {...shared} />;
        case "long_text":
            return <LongTextEditor question={element} {...shared} />;
        case "opinion_scale":
            return <OpinionScaleEditor question={element} {...shared} />;
        case "nps":
            return <NpsEditor question={element} {...shared} />;
        case "matrix_single":
            return <MatrixSingleEditor question={element} {...shared} />;
        default:
            return assertNever(element, "survey element");
    }
}

export function EditorPanel({
    selected,
    elements,
    keyPolicy,
    onChange,
    onDuplicate,
    onDelete,
    insetHeader = false,
    className
}: {
    readonly selected: SurveyElement | null;
    readonly elements: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
    readonly onDuplicate: () => void;
    readonly onDelete: () => void;
    /**
     * Keeps the header's actions clear of `Sheet`'s own close button, which is
     * absolutely positioned in the same corner. Without it the sheet's ✕ sits
     * on top of Delete — one mis-aimed click away from removing an element
     * that has no undo.
     */
    readonly insetHeader?: boolean;
    readonly className?: string;
}) {
    const t = useTranslations("Builder.editor");
    const typeName = useElementTypeName();

    return (
        <div className={cn("flex min-h-0 flex-col bg-background", className)}>
            <PanelHeader
                title={selected === null ? t("title") : typeName(selected.type)}
                {...(insetHeader && { className: "pr-11" })}
                {...(selected !== null && {
                    actions: (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onDuplicate}
                                aria-label={t("duplicateLabel", {
                                    title: selected.title
                                })}
                                className="h-7 rounded px-1.5 text-xs text-muted-foreground"
                            >
                                <Copy aria-hidden />
                                {t("duplicate")}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onDelete}
                                aria-label={t("deleteLabel", {
                                    title: selected.title
                                })}
                                className="h-7 rounded px-1.5 text-xs text-muted-foreground hover:text-destructive"
                            >
                                <Trash aria-hidden />
                                {t("delete")}
                            </Button>
                        </>
                    )
                })}
            />

            <div className="min-h-0 flex-1 overflow-y-auto">
                {selected === null ? (
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
                ) : (
                    <div className="flex flex-col gap-3.5 p-3">
                        {/* Keyed by element, so selecting a second question of
                            the same type remounts the editor: its local state
                            — the key field's open/warned flags — belongs to
                            the element being edited, not to the panel. */}
                        <ElementEditor
                            key={selected.id}
                            element={selected}
                            siblings={elements}
                            keyPolicy={keyPolicy}
                            onChange={onChange}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
