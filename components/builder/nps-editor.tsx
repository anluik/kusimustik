"use client";

import { useTranslations } from "next-intl";

import {
    ElementFields,
    RequiredToggle,
    ToggleSection
} from "@/components/builder/element-fields";
import { NPS_MAX, NPS_MIN } from "@/domain/question";
import type { NpsQuestion, SurveyElement } from "@/domain/question";

/**
 * Net Promoter Score. The scale is fixed at 0–10 and the promoter, passive and
 * detractor bands are fixed with it — that is the whole point of the type, and
 * a configurable NPS is not an NPS. So there is nothing to configure here but
 * the wording and whether an answer is required.
 */
export function NpsEditor({
    question,
    onChange
}: {
    readonly question: NpsQuestion;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");

    return (
        <>
            <ElementFields
                element={question}
                onChange={onChange}
                titleLabel={t("titleLabel")}
                titlePlaceholder={t("titlePlaceholder")}
            />

            <p className="border-t pt-3 text-[11px] leading-[1.35] text-muted-foreground">
                {t("npsHelp", { min: NPS_MIN, max: NPS_MAX })}
            </p>

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
