"use client";

import { useTranslations } from "next-intl";

import {
    ElementFields,
    OtherToggle,
    RequiredToggle,
    ToggleSection
} from "@/components/builder/element-fields";
import {
    OptionListEditor,
    useChoiceListCopy
} from "@/components/builder/option-list-editor";
import type { SingleChoiceQuestion, SurveyElement } from "@/domain/question";
import type { SurveyKeys } from "@/lib/builder/keys";

/** One answer from a list of radio buttons, optionally plus a written one. */
export function SingleChoiceEditor({
    question,
    siblings,
    keys,
    onChange
}: {
    readonly question: SingleChoiceQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keys: SurveyKeys;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const copy = useChoiceListCopy();

    return (
        <>
            <ElementFields
                element={question}
                siblings={siblings}
                keys={keys}
                onChange={onChange}
                titleLabel={t("titleLabel")}
                titlePlaceholder={t("titlePlaceholder")}
            />

            <OptionListEditor
                dndId={`options-${question.id}`}
                options={question.options}
                minimum={2}
                copy={copy.options}
                onChange={options =>
                    onChange({ ...question, options: [...options] })
                }
            />

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
                <OtherToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
