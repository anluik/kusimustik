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
import type { MatrixSingleQuestion, SurveyElement } from "@/domain/question";

/**
 * One answer per row, from a shared set of columns.
 *
 * Rows and columns are two independent lists with their own values, and a
 * required matrix means *every* row answered — `buildAnswerSchema` checks row
 * coverage, and the CSV fans the question out to one column per row. Both
 * lists therefore reorder the same way the options do, and neither renames a
 * value.
 */
export function MatrixSingleEditor({
    question,
    onChange
}: {
    readonly question: MatrixSingleQuestion;
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
                dndId={`rows-${question.id}`}
                list="rows"
                options={question.rows}
                minimum={1}
                copy={copy.rows}
                onChange={rows => onChange({ ...question, rows: [...rows] })}
            />

            <OptionListEditor
                dndId={`columns-${question.id}`}
                list="columns"
                options={question.columns}
                minimum={2}
                copy={copy.columns}
                onChange={columns =>
                    onChange({ ...question, columns: [...columns] })
                }
            />

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
