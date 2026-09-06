"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { AddElementMenu } from "@/components/builder/add-element-menu";
import { EditorPanel } from "@/components/builder/editor-panel";
import { ElementCanvas } from "@/components/builder/element-canvas";
import { ElementList } from "@/components/builder/element-list";
import { SaveIndicator } from "@/components/builder/save-indicator";
import { AppBar } from "@/components/shell/app-bar";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import type { QuestionId, SurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";
import type { KeyPolicy } from "@/lib/builder/keys";
import {
    createElement,
    type CreatableElementType
} from "@/lib/builder/new-element";

/**
 * The three-panel builder: what the survey contains, what it will look like,
 * and the settings of whichever element is selected.
 *
 * DESIGN.md §4 sizes the panels 268 / fluid / 340 and §5 puts the editor in a
 * `Sheet` below 1280px, where three columns do not fit. The element list goes
 * away below `md` — the canvas is still selectable there, and reordering is a
 * pointer-and-keyboard job on a screen wide enough to see the order.
 */

/** DESIGN §4: the editor is a static column from 1280px up, a sheet below. */
const EDITOR_AS_SHEET = "(max-width: 1279px)";

export function BuilderScreen({
    surveyId,
    title,
    initialElements,
    initialVersion,
    keyPolicy
}: {
    readonly surveyId: SurveyId;
    readonly title: string;
    readonly initialElements: readonly SurveyElement[];
    readonly initialVersion: number;
    readonly keyPolicy: KeyPolicy;
}) {
    const t = useTranslations("Builder");
    const builder = useSurveyBuilder({
        surveyId,
        initialElements,
        initialVersion
    });

    const asSheet = useMediaQuery(EDITOR_AS_SHEET);
    const [sheetOpen, setSheetOpen] = useState(false);

    const defaults = {
        title: t("defaults.questionTitle"),
        optionLabel: (index: number) => t("defaults.optionLabel", { index })
    };

    function add(type: CreatableElementType) {
        builder.add(createElement(type, defaults, builder.elements));
        setSheetOpen(true);
    }

    function select(id: QuestionId) {
        builder.select(id);
        // On a narrow viewport the editor is a sheet, and selecting an element
        // is the only thing that would open it.
        setSheetOpen(true);
    }

    const editor = (
        <EditorPanel
            selected={builder.selected}
            elements={builder.elements}
            keyPolicy={keyPolicy}
            onChange={builder.replace}
            onDelete={() => {
                if (builder.selectedId === null) return;
                builder.remove(builder.selectedId);
                setSheetOpen(false);
            }}
        />
    );

    return (
        <>
            <AppBar
                title={title}
                meta={
                    <SaveIndicator
                        status={builder.status}
                        onRetry={builder.retry}
                    />
                }
                actions={<AddElementMenu onAdd={add} />}
            />

            {/* The panels own their own scrolling, so the page itself does not
                scroll: the app bar is 44px and this is the rest of it. */}
            <div className="flex h-[calc(100svh-2.75rem)] min-h-0">
                <ElementList
                    elements={builder.elements}
                    selectedId={builder.selectedId}
                    onSelect={select}
                    onMove={builder.move}
                    className="hidden w-[268px] shrink-0 border-r md:flex"
                />

                <ElementCanvas
                    elements={builder.elements}
                    selectedId={builder.selectedId}
                    onSelect={select}
                    className="flex-1"
                />

                {!asSheet && (
                    <div className="w-[340px] shrink-0 border-l">{editor}</div>
                )}
            </div>

            {asSheet && (
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                    <SheetContent
                        side="right"
                        className="w-[340px] gap-0 p-0 sm:max-w-[340px]"
                    >
                        <SheetHeader className="sr-only">
                            <SheetTitle>{t("editor.title")}</SheetTitle>
                        </SheetHeader>
                        {editor}
                    </SheetContent>
                </Sheet>
            )}
        </>
    );
}
