"use client";

import { useTranslations } from "next-intl";

import {
    TextPathArea,
    TextPathField
} from "@/components/builder/element-fields";
import type { SurveyHead } from "@/domain/survey";
import { withHeadDescription } from "@/lib/builder/element-patch";

/**
 * The survey's own title and the paragraph above the first question.
 *
 * These used to be a modal settings dialog. They are content — a respondent
 * reads both, and both are the first thing they read — so they are the header
 * block at the top of the element list now, edited in the same panel as a
 * question and saved with the rest of the document (docs/DECISIONS.md 034).
 *
 * That is the whole implementation: two `TextPath` fields, which brings the
 * placeholder-from-the-source-language and the blank-is-only-an-error-when-no
 * -language-has-it rules with them. There is no key, because the survey is not
 * a column in anyone's CSV, and no required toggle, because a title is not
 * something a respondent answers.
 */
export function SurveyHeadFields({
    head,
    onChange
}: {
    readonly head: SurveyHead;
    readonly onChange: (head: SurveyHead) => void;
}) {
    const t = useTranslations("Builder.editor");
    const tErrors = useTranslations("Builder.errors");

    // Constants rather than `fieldId`: there is exactly one head, so there is
    // nothing to namespace it against.
    return (
        <>
            <TextPathField
                id="survey-head-title"
                label={t("surveyTitleLabel")}
                path="title"
                value={head.title}
                placeholder={t("surveyTitlePlaceholder")}
                requiredError={tErrors("surveyTitleRequired")}
                onChange={title => onChange({ ...head, title })}
            />

            <TextPathArea
                id="survey-head-description"
                label={t("surveyDescriptionLabel")}
                path="description"
                value={head.description ?? ""}
                placeholder={t("surveyDescriptionPlaceholder")}
                help={t("surveyDescriptionHelp")}
                rows={3}
                onChange={value => onChange(withHeadDescription(head, value))}
            />
        </>
    );
}
