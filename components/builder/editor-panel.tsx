"use client";

import { Trash } from "lucide-react";
import { useTranslations } from "next-intl";

import { useElementTypeName } from "@/components/builder/element-type";
import { PanelHeader } from "@/components/builder/panel";
import { SingleChoiceEditor } from "@/components/builder/single-choice-editor";
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
 * Only `single_choice` has an editor so far. The other eight are named
 * explicitly in the branch that says so — not caught by a fallback — so that
 * `assertNever` still fails the build the day a ninth type joins the union,
 * and so that this list is the checklist of what Phase 5 has left to do. The
 * add menu offers only what has an editor, but a survey can still *contain*
 * any of the nine: it may have been seeded, or duplicated from a wave built
 * before a type's editor was removed. See docs/DECISIONS.md 014.
 */

function UnavailableEditor({ type }: { readonly type: string }) {
    const t = useTranslations("Builder.editor");

    return (
        <EmptyState
            title={t("unavailable.title")}
            body={t("unavailable.body", { type })}
            preview={
                <>
                    <EmptyStateRow />
                    <EmptyStateRow />
                </>
            }
        />
    );
}

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
    const typeName = useElementTypeName();

    switch (element.type) {
        case "single_choice":
            return (
                <div className="p-3">
                    <SingleChoiceEditor
                        question={element}
                        siblings={siblings}
                        keyPolicy={keyPolicy}
                        onChange={onChange}
                    />
                </div>
            );

        // Still to come, one type per step of Phase 5.
        case "statement":
        case "multi_choice":
        case "dropdown":
        case "short_text":
        case "long_text":
        case "opinion_scale":
        case "nps":
        case "matrix_single":
            return <UnavailableEditor type={typeName(element.type)} />;

        default:
            return assertNever(element, "survey element");
    }
}

export function EditorPanel({
    selected,
    elements,
    keyPolicy,
    onChange,
    onDelete,
    className
}: {
    readonly selected: SurveyElement | null;
    readonly elements: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
    readonly onDelete: () => void;
    readonly className?: string;
}) {
    const t = useTranslations("Builder.editor");
    const typeName = useElementTypeName();

    return (
        <div className={cn("flex min-h-0 flex-col bg-background", className)}>
            <PanelHeader
                title={selected === null ? t("title") : typeName(selected.type)}
                {...(selected !== null && {
                    actions: (
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
                    <ElementEditor
                        element={selected}
                        siblings={elements}
                        keyPolicy={keyPolicy}
                        onChange={onChange}
                    />
                )}
            </div>
        </div>
    );
}
