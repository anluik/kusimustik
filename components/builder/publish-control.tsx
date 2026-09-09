"use client";

import { Send, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/surveys/confirm-action-dialog";
import { ShareLink } from "@/components/surveys/share-link";
import { Button } from "@/components/ui/button";
import type { SurveyLocale } from "@/domain/content";
import type { SurveyId } from "@/domain/ids";
import type { SurveyStatus } from "@/domain/survey";
import { publishSurveyAction } from "@/lib/surveys/actions";

/**
 * Publishing, and the link, in the place the survey is written.
 *
 * Both used to live only in the survey list's row menu. Creating a survey
 * opens the builder (DECISIONS 020), so the path the product promises —
 * write it, then send it — ran off the end of the builder and back into a
 * list to hunt for a `…` menu. This is the other end of that path.
 *
 * It changes shape with the survey rather than staying put and greying out:
 *
 * - **Draft or closed** — the publish button, which reopens a closed survey on
 *   its original slug. Rendered only once there is a question to publish. The
 *   row menu keeps the disabled-with-a-reason form, because a menu has room to
 *   explain itself and the app bar does not; here the empty canvas already
 *   says that the first question comes next, and a dead button beside the
 *   primary action reads as a fault.
 * - **Published** — the link, ready to copy, and only from `sm` up. The bar
 *   already carries four controls on a phone and the title was truncating to
 *   one letter to fit them; the survey list a tap away keeps its own copy
 *   button at every width, so nothing is lost by leaving this one out.
 *
 * `answerableCount` is the builder's own live count, not the server's, so a
 * question added a second ago is enough for the button to appear without a
 * round trip. `publishSurveyAction` re-checks it either way — that is the
 * check that counts.
 *
 * `untranslatedLocales` is the one thing the dialog says that the button does
 * not. Publishing a half-translated survey is legitimate — every untranslated
 * field falls back to the language the survey is written in, so nothing breaks
 * — but it is not what an author who has been translating for an hour means to
 * do, and publishing is the last moment they are asked anything. It informs
 * rather than blocks (DESIGN §6): the sentence says what a respondent will
 * actually see, and the confirm button is untouched.
 *
 * `unsaved` is why it can appear and still be unavailable. Publishing acts on
 * the document *the server* holds, so offering it while the screen is ahead of
 * the server publishes the wrong thing — and in the worst case the action
 * refuses a survey the owner is looking at a question in, because autosave has
 * not caught up yet. The `SaveIndicator` sits in the same bar and is already
 * saying which of "salvestamata", "salvestan…" or "paranda vead" applies, so
 * the disabled button has its explanation an inch away (DESIGN §6).
 */
export function PublishControl({
    surveyId,
    status,
    slug,
    answerableCount,
    untranslatedLocales,
    unsaved
}: {
    readonly surveyId: SurveyId;
    readonly status: SurveyStatus;
    /** The public slug, once the survey has been published at least once. */
    readonly slug: string | null;
    readonly answerableCount: number;
    /** Offered languages that still have text with no translation in them. */
    readonly untranslatedLocales: readonly SurveyLocale[];
    /** The document on screen is ahead of — or rejected by — the server. */
    readonly unsaved: boolean;
}) {
    const t = useTranslations("Builder.publish");
    const tPublish = useTranslations("Surveys.publish");
    const tLanguage = useTranslations("Language");
    const [confirming, setConfirming] = useState(false);

    if (status === "published") {
        if (slug === null) return null;
        // A live link with nothing behind it. The runner tells respondents so
        // and the results tab tells the owner, but only if they go and look —
        // and the one thing the bar would otherwise offer here is a button
        // that copies a link which currently collects nothing.
        if (answerableCount === 0) {
            return (
                <span className="truncate font-mono text-[11px] leading-none text-destructive">
                    {t("collectingNothing")}
                </span>
            );
        }
        return (
            <span className="hidden sm:flex">
                <ShareLink slug={slug} />
            </span>
        );
    }

    if (answerableCount === 0) return null;

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unsaved}
                onClick={() => setConfirming(true)}
                className="h-[30px] rounded text-xs"
            >
                <Send aria-hidden />
                {slug === null ? t("publish") : t("republish")}
            </Button>

            <ConfirmActionDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={tPublish("title")}
                // A survey that has been published before keeps its slug, so
                // the promise is different: the old link starts working again.
                body={
                    <>
                        {slug === null
                            ? tPublish("body")
                            : tPublish("bodyReopen")}
                        {untranslatedLocales.length > 0 && (
                            <span className="mt-2 flex items-start gap-1.5 rounded border bg-muted p-2 text-foreground">
                                <TriangleAlert
                                    aria-hidden
                                    className="mt-px size-3.5 shrink-0 text-muted-foreground"
                                />
                                <span>
                                    {t("untranslated", {
                                        languages: untranslatedLocales
                                            .map(locale =>
                                                tLanguage(`name.${locale}`)
                                            )
                                            .join(", ")
                                    })}
                                </span>
                            </span>
                        )}
                    </>
                }
                confirmLabel={tPublish("submit")}
                run={() => publishSurveyAction({ surveyId })}
            />
        </>
    );
}
