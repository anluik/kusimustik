"use client";

import { useTranslations } from "next-intl";

import {
    EditorSection,
    ElementFields,
    OtherToggle,
    RequiredToggle,
    ToggleSection,
    fieldId
} from "@/components/builder/element-fields";
import { Field } from "@/components/builder/field";
import {
    OptionListEditor,
    useChoiceListCopy
} from "@/components/builder/option-list-editor";
import { Input } from "@/components/ui/input";
import type { MultiChoiceQuestion, SurveyElement } from "@/domain/question";
import {
    readOptionalNumber,
    withSelectionBound,
    withSelectionBoundsInRange
} from "@/lib/builder/element-patch";
import type { KeyPolicy } from "@/lib/builder/keys";

/**
 * Checkboxes, with an optional floor and ceiling on how many may be ticked.
 *
 * The two bounds are clamped rather than merely validated: the schema rejects
 * a minimum above the maximum, or either above the number of things on offer,
 * and a document the schema rejects parks the autosave. Editing one bound
 * therefore pulls the other along, and deleting an option pulls both down —
 * see `lib/builder/element-patch.ts`.
 */
export function MultiChoiceEditor({
    question,
    siblings,
    keyPolicy,
    onChange
}: {
    readonly question: MultiChoiceQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");
    const copy = useChoiceListCopy();

    const selectable = question.options.length + (question.allowOther ? 1 : 0);

    const bound = (which: "minSelections" | "maxSelections") => (
        <Field id={fieldId(question, which)} label={t(`${which}Label`)}>
            <Input
                id={fieldId(question, which)}
                type="number"
                inputMode="numeric"
                min={1}
                max={selectable}
                value={question[which] ?? ""}
                placeholder={t("selectionsPlaceholder")}
                onChange={event =>
                    onChange(
                        withSelectionBound(
                            question,
                            which,
                            readOptionalNumber(event.currentTarget.value)
                        )
                    )
                }
                className="h-[30px] rounded text-xs"
            />
        </Field>
    );

    return (
        <>
            <ElementFields
                element={question}
                siblings={siblings}
                keyPolicy={keyPolicy}
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
                    onChange(
                        withSelectionBoundsInRange({
                            ...question,
                            options: [...options]
                        })
                    )
                }
            />

            <EditorSection label={t("selectionsLabel")}>
                <div className="grid grid-cols-2 gap-2">
                    {bound("minSelections")}
                    {bound("maxSelections")}
                </div>
                <p className="text-[11px] leading-[1.35] text-muted-foreground">
                    {t("selectionsHelp", { count: selectable })}
                </p>
            </EditorSection>

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
                <OtherToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
