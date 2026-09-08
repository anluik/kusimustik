"use client";

import { BarChart3, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { AddElementMenu } from "@/components/builder/add-element-menu";
import { CollectedAnswersProvider } from "@/components/builder/collected-answers";
import { PublishControl } from "@/components/builder/publish-control";
import { EditorPanel } from "@/components/builder/editor-panel";
import { ElementCanvas } from "@/components/builder/element-canvas";
import { ElementList } from "@/components/builder/element-list";
import { SaveIndicator } from "@/components/builder/save-indicator";
import {
    SurveySettingsDialog,
    type SurveySettings
} from "@/components/builder/survey-settings-dialog";
import { AppBar } from "@/components/shell/app-bar";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import type { QuestionId, SurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import type { SurveyStatus } from "@/domain/survey";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";
import type { SurveyKeys } from "@/lib/builder/keys";
import {
    createElement,
    duplicateElement,
    type CreatableElementType
} from "@/lib/builder/new-element";
import { ROUTES } from "@/lib/routes";

/**
 * The three-panel builder: what the survey contains, what it will look like,
 * and the settings of whichever element is selected.
 *
 * DESIGN.md §4 sizes the panels 268 / fluid / 340 and §5 puts the editor in a
 * `Sheet` below 1280px, where three columns do not fit. The element list goes
 * away below `md` — the canvas is still selectable there, and reordering is a
 * pointer-and-keyboard job on a screen wide enough to see the order.
 *
 * The survey's own settings — title, language, wave — are a dialog rather than
 * a fourth panel: they are read once and changed rarely, and unlike everything
 * else here they are a submit rather than an autosave.
 */

/** DESIGN §4: the editor is a static column from 1280px up, a sheet below. */
const EDITOR_AS_SHEET = "(max-width: 1279px)";

export function BuilderScreen({
    surveyId,
    initialSettings,
    initialElements,
    initialVersion,
    keys,
    hasResults,
    responseCount,
    status,
    slug
}: {
    readonly surveyId: SurveyId;
    readonly initialSettings: SurveySettings;
    readonly initialElements: readonly SurveyElement[];
    readonly initialVersion: number;
    /** Which keys are spoken for, and whether a key may still follow its title. */
    readonly keys: SurveyKeys;
    /** The survey has been published at least once, so results exist. */
    readonly hasResults: boolean;
    /** Answers already collected, which is what makes an edit destructive. */
    readonly responseCount: number;
    readonly status: SurveyStatus;
    /** The public slug, once the survey has been published at least once. */
    readonly slug: string | null;
}) {
    const t = useTranslations("Builder");
    const tResults = useTranslations("Results");
    const builder = useSurveyBuilder({
        surveyId,
        initialElements,
        initialVersion,
        keys
    });

    const asSheet = useMediaQuery(EDITOR_AS_SHEET);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Held locally so the app bar follows the save immediately; the action
    // refreshes the router too, for the survey list and the runner.
    const [settings, setSettings] = useState(initialSettings);

    const defaults = {
        title: t("defaults.questionTitle"),
        statementTitle: t("defaults.statementTitle"),
        optionLabel: (index: number) => t("defaults.optionLabel", { index }),
        rowLabel: (index: number) => t("defaults.rowLabel", { index }),
        columnLabel: (index: number) => t("defaults.columnLabel", { index })
    };

    function add(type: CreatableElementType) {
        builder.add(
            createElement(type, defaults, builder.elements, builder.keys)
        );
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
            keys={builder.keys}
            insetHeader={asSheet}
            onChange={builder.replace}
            onDuplicate={() => {
                const source = builder.selected;
                if (source === null) return;
                builder.duplicate(
                    source.id,
                    duplicateElement(source, builder.elements, builder.keys)
                );
            }}
            onDelete={() => {
                if (builder.selectedId === null) return;
                builder.remove(builder.selectedId);
                setSheetOpen(false);
            }}
        />
    );

    return (
        <CollectedAnswersProvider count={responseCount}>
            <AppBar
                title={settings.title}
                metaOnNarrow
                meta={
                    <SaveIndicator
                        status={builder.status}
                        onRetry={builder.retry}
                    />
                }
                actions={
                    <>
                        <PublishControl
                            surveyId={surveyId}
                            status={status}
                            slug={slug}
                            answerableCount={
                                builder.elements.filter(
                                    element => element.isAnswerable
                                ).length
                            }
                            unsaved={builder.status.kind !== "clean"}
                        />
                        {/* Only once the survey has been published: before
                            that there is nothing to show, and DESIGN §6 would
                            have this be a disabled control rather than an
                            absent one — but the app bar is not a menu, and a
                            dead button beside the primary action reads as a
                            fault. The row menu carries the disabled form. */}
                        {hasResults && (
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-[30px] rounded text-xs"
                            >
                                <Link
                                    href={ROUTES.results(surveyId)}
                                    // Icon-only on a phone, where the bar has
                                    // four controls and no room for a fourth
                                    // label. The accessible name stays.
                                    aria-label={tResults("title")}
                                >
                                    <BarChart3 aria-hidden />
                                    <span className="hidden sm:inline">
                                        {tResults("title")}
                                    </span>
                                </Link>
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={t("settings.label")}
                            onClick={() => setSettingsOpen(true)}
                            className="h-[30px] rounded text-xs"
                        >
                            <Settings2 aria-hidden />
                        </Button>
                        <AddElementMenu onAdd={add} />
                    </>
                }
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

            <SurveySettingsDialog
                surveyId={surveyId}
                settings={settings}
                version={builder.version}
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onSaved={(saved, version) => {
                    setSettings(saved);
                    builder.syncVersion(version);
                }}
            />
        </CollectedAnswersProvider>
    );
}
