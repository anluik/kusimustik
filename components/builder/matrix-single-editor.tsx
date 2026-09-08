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
import type { SurveyKeys } from "@/lib/builder/keys";

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
    siblings,
    keys,
    onChange
}: {
    readonly question: MatrixSingleQuestion;
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
                dndId={`rows-${question.id}`}
                options={question.rows}
                minimum={1}
                copy={copy.rows}
                onChange={rows => onChange({ ...question, rows: [...rows] })}
            />

            <OptionListEditor
                dndId={`columns-${question.id}`}
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
