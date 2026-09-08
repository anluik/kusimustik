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
import type { SurveyKeys } from "@/lib/builder/keys";

/**
 * The same single answer as `single_choice`, presented as a select because the
 * list is long. It has no "other": a written answer belongs next to visible
 * options, not hidden at the bottom of a scroll.
 */
export function DropdownEditor({
    question,
    siblings,
    keys,
    onChange
}: {
    readonly question: DropdownQuestion;
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
            </ToggleSection>
        </>
    );
}
