"use client";

import { useTranslations } from "next-intl";

import {
    EditorSection,
    ElementFields,
    RequiredToggle,
    ToggleSection,
    fieldId
} from "@/components/builder/element-fields";
import { Field } from "@/components/builder/field";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    OPINION_SCALE_MAX_STEPS,
    OPINION_SCALE_MIN,
    type OpinionScaleQuestion,
    type SurveyElement
} from "@/domain/question";
import { withScaleLabel } from "@/lib/builder/element-patch";
import type { KeyPolicy } from "@/lib/builder/keys";

/**
 * A scale from 1 to `max`, with optional wording at each end.
 *
 * The length is a `Select` rather than a number field because the range is
 * short, discrete and bounded by the schema: there is no intermediate value to
 * type, so there is no invalid state to park the autosave on. The endpoints
 * are the only labels a scale has — the steps between them are numbers, which
 * is what makes the aggregate a mean rather than a set of counts.
 */

/** 2..15: a one-step scale is not a scale, and the schema stops at 15. */
const LENGTHS = Array.from(
    { length: OPINION_SCALE_MAX_STEPS - 1 },
    (_, index) => index + 2
);

export function OpinionScaleEditor({
    question,
    siblings,
    keyPolicy,
    onChange
}: {
    readonly question: OpinionScaleQuestion;
    readonly siblings: readonly SurveyElement[];
    readonly keyPolicy: KeyPolicy;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");

    const endpoint = (which: "minLabel" | "maxLabel") => (
        <Field
            id={fieldId(question, which)}
            label={t(which === "minLabel" ? "scaleMinLabel" : "scaleMaxLabel", {
                step: which === "minLabel" ? OPINION_SCALE_MIN : question.max
            })}
        >
            <Input
                id={fieldId(question, which)}
                value={question[which] ?? ""}
                placeholder={t("scaleLabelPlaceholder")}
                autoComplete="off"
                onChange={event =>
                    onChange(
                        withScaleLabel(
                            question,
                            which,
                            event.currentTarget.value
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

            <EditorSection label={t("scaleLabel")}>
                <Field
                    id={fieldId(question, "max")}
                    label={t("scaleStepsLabel")}
                >
                    <Select
                        value={String(question.max)}
                        onValueChange={value =>
                            onChange({ ...question, max: Number(value) })
                        }
                    >
                        <SelectTrigger
                            id={fieldId(question, "max")}
                            size="sm"
                            className="w-full rounded text-xs"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded">
                            {LENGTHS.map(length => (
                                <SelectItem
                                    key={length}
                                    value={String(length)}
                                    className="rounded text-xs"
                                >
                                    {t("scaleSteps", {
                                        min: OPINION_SCALE_MIN,
                                        max: length
                                    })}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                {endpoint("minLabel")}
                {endpoint("maxLabel")}
            </EditorSection>

            <ToggleSection>
                <RequiredToggle question={question} onChange={onChange} />
            </ToggleSection>
        </>
    );
}
