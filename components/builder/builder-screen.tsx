"use client";

import { BarChart3, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AddElementMenu } from "@/components/builder/add-element-menu";
import { CollectedAnswersProvider } from "@/components/builder/collected-answers";
import { LanguageSwitcher } from "@/components/builder/language-switcher";
import { TranslationProvider } from "@/components/builder/translation";
import { PublishControl } from "@/components/builder/publish-control";
import { EditorPanel } from "@/components/builder/editor-panel";
import { ElementCanvas } from "@/components/builder/element-canvas";
import { HEAD } from "@/lib/builder/document";
import type { BuilderSelection } from "@/lib/builder/document";
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
import type { SurveyLocale } from "@/domain/content";
import type { SurveyId } from "@/domain/ids";
import {
    elementTexts,
    headTexts,
    missingTranslationCount,
    missingTranslations
} from "@/domain/localize";
import type { AuthoredElement } from "@/domain/question";
import type { AuthoredSurveyHead, SurveyStatus } from "@/domain/survey";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSurveyBuilder } from "@/hooks/use-survey-builder";
import type { SurveyKeys } from "@/lib/builder/keys";
import { elementCopy } from "@/lib/builder/element-copy";
import {
    createElement,
    type CreatableElementType
} from "@/lib/builder/new-element";
import type { ElementCopyMessages } from "@/lib/i18n/messages";
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
 * The survey's own settings — title, languages, wave — are a dialog rather
 * than a fourth panel: they are read once and changed rarely, and unlike
 * everything else here they are a submit rather than an autosave.
 *
 * A survey offered in more than one language adds a fourth control to the app
 * bar and nothing else: the three panels hold whichever language it names, and
 * the one being translated from shows through as placeholder text. See
 * docs/DECISIONS.md 031.
 */

/** DESIGN §4: the editor is a static column from 1280px up, a sheet below. */
const EDITOR_AS_SHEET = "(max-width: 1279px)";

export function BuilderScreen({
    surveyId,
    initialSettings,
    initialHead,
    initialElements,
    initialVersion,
    keys,
    elementCopyMessages,
    hasResults,
    responseCount,
    status,
    slug
}: {
    readonly surveyId: SurveyId;
    readonly initialSettings: SurveySettings;
    /** The survey's own title and intro — every language, not one of them. */
    readonly initialHead: AuthoredSurveyHead;
    /** The stored document — every language, not one of them. */
    readonly initialElements: readonly AuthoredElement[];
    readonly initialVersion: number;
    /** Which keys are spoken for, and whether a key may still follow its title. */
    readonly keys: SurveyKeys;
    /** The words a new element is born with, in every language a survey may be
     *  written in; see `lib/builder/element-copy.ts`. */
    readonly elementCopyMessages: ElementCopyMessages;
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
    const asSheet = useMediaQuery(EDITOR_AS_SHEET);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Held locally so the app bar follows the save immediately; the action
    // refreshes the router too, for the survey list and the runner.
    const [settings, setSettings] = useState(initialSettings);
    // Which of the survey's languages is being edited. Not derived from the
    // settings, because it is a view of the document rather than a property of
    // it — closing the builder forgets it, as it should.
    const [locale, setLocale] = useState<SurveyLocale>(initialSettings.locale);

    const builder = useSurveyBuilder({
        surveyId,
        initialHead,
        initialElements,
        initialVersion,
        keys,
        source: settings.locale,
        locale
    });

    // Which elements still have something to translate, for the marker on the
    // element list's rows. Empty while editing the survey's own language: what
    // a survey is written in is never behind.
    const untranslated = new Set(
        locale === settings.locale
            ? []
            : builder.stored
                  .filter(
                      element =>
                          missingTranslations(elementTexts(element), locale) > 0
                  )
                  .map(element => element.id)
    );

    // The same question of the survey's own head, which is a row in that list
    // and is short of a translation the same way a question can be.
    const headUntranslated =
        locale !== settings.locale &&
        missingTranslations(headTexts(builder.storedHead), locale) > 0;

    // The same question asked of every language at once, for the publish
    // dialog: which of the ones this survey is offered in are still short of a
    // translation somewhere.
    const untranslatedLocales = settings.locales.filter(
        candidate =>
            candidate !== settings.locale &&
            missingTranslationCount(
                builder.storedHead,
                builder.stored,
                candidate
            ) > 0
    );

    // A new element's words go into the survey's own language, since that is
    // what `builder.add` authors them into; anything the editor panel creates
    // goes into the language on screen. Neither is the language the *app* is
    // being read in (docs/DECISIONS.md 032).
    const sourceCopy = useMemo(
        () => elementCopy(elementCopyMessages, settings.locale),
        [elementCopyMessages, settings.locale]
    );
    const activeCopy = useMemo(
        () => elementCopy(elementCopyMessages, locale),
        [elementCopyMessages, locale]
    );

    function add(type: CreatableElementType) {
        builder.add(
            createElement(type, sourceCopy, builder.elements, builder.keys)
        );
        setSheetOpen(true);
    }

    function select(id: BuilderSelection) {
        builder.select(id);
        // On a narrow viewport the editor is a sheet, and selecting something
        // is the only thing that would open it.
        setSheetOpen(true);
    }

    const editor = (
        <TranslationProvider
            locale={locale}
            source={settings.locale}
            texts={builder.selectedTexts}
            copy={activeCopy}
        >
            <EditorPanel
                target={
                    builder.selected === null
                        ? { kind: "head", head: builder.head }
                        : { kind: "element", element: builder.selected }
                }
                elements={builder.elements}
                keys={builder.keys}
                insetHeader={asSheet}
                onChange={builder.replace}
                onHeadChange={builder.replaceHead}
                onDuplicate={() => {
                    if (builder.selectedId === HEAD) return;
                    builder.duplicate(builder.selectedId);
                }}
                onDelete={() => {
                    if (builder.selectedId === HEAD) return;
                    builder.remove(builder.selectedId);
                    setSheetOpen(false);
                }}
            />
        </TranslationProvider>
    );

    return (
        <CollectedAnswersProvider count={responseCount}>
            <AppBar
                // The head as it reads in the language being edited, so the
                // bar answers a rename immediately and shows the fallback
                // while a translation is unfinished.
                title={builder.shownHead.title}
                metaOnNarrow
                meta={
                    <SaveIndicator
                        status={builder.status}
                        onRetry={builder.retry}
                    />
                }
                actions={
                    <>
                        <LanguageSwitcher
                            locale={locale}
                            source={settings.locale}
                            locales={settings.locales}
                            onSelect={setLocale}
                        />
                        <PublishControl
                            surveyId={surveyId}
                            status={status}
                            slug={slug}
                            answerableCount={
                                builder.stored.filter(
                                    element => element.isAnswerable
                                ).length
                            }
                            untranslatedLocales={untranslatedLocales}
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
                    elements={builder.shown}
                    untranslated={untranslated}
                    selectedId={builder.selectedId}
                    headTitle={builder.shownHead.title}
                    headSelected={builder.selectedId === HEAD}
                    headUntranslated={headUntranslated}
                    onSelectHead={() => select(HEAD)}
                    onSelect={select}
                    onMove={builder.move}
                    className="hidden w-[268px] shrink-0 border-r md:flex"
                />

                <ElementCanvas
                    head={builder.shownHead}
                    elements={builder.shown}
                    selectedId={builder.selectedId}
                    onSelect={select}
                    onSelectHead={() => select(HEAD)}
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
                    // The author may have just stopped offering the language
                    // on screen, or changed which one the survey is written
                    // in. Either way the panel falls back to the source rather
                    // than editing a language the survey no longer has.
                    if (!saved.locales.includes(locale))
                        setLocale(saved.locale);
                    builder.syncVersion(version);
                }}
            />
        </CollectedAnswersProvider>
    );
}
