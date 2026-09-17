"use client";

import { useTranslations } from "next-intl";

import {
    ElementFields,
    RequiredToggle,
    ToggleSection
} from "@/components/builder/element-fields";
import {
    OptionListEditor,
    useChoiceListCopy
} from "@/components/builder/option-list-editor";
import type { DropdownQuestion, SurveyElement } from "@/domain/question";

/**
 * The same single answer as `single_choice`, presented as a select because the
 * list is long. It has no "other": a written answer belongs next to visible
 * options, not hidden at the bottom of a scroll.
 */
export function DropdownEditor({
    question,
    onChange
}: {
    readonly question: DropdownQuestion;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const copy = useChoiceListCopy();

    return (
        <>
            <ElementFields
                element={question}
                onChange={onChange}
                titleLabel={t("titleLabel")}
                titlePlaceholder={t("titlePlaceholder")}
            />

            <OptionListEditor
                dndId={`options-${question.id}`}
                list="options"
                options={question.options}
                minimum={2}
                copy={copy.options}
                onChange={options =>
                    onChange({ ...question, options: [...options] })
                }
            />

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
