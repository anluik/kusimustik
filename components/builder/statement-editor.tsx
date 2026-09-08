"use client";

import { useTranslations } from "next-intl";

import { ElementFields } from "@/components/builder/element-fields";
import type { StatementElement, SurveyElement } from "@/domain/question";
import type { SurveyKeys } from "@/lib/builder/keys";

/**
 * A statement is shown, not asked (connect.ee's "väite tekst"), so it has no
 * required toggle and nothing to configure beyond its text — the aggregator
 * and the exporter skip it, and the runner renders it with no control.
 *
 * It still carries a `key`, because it still occupies a position that wave
 * comparison lines up.
 */
export function StatementEditor({
    element,
    siblings,
    keys,
    onChange
}: {
    readonly element: StatementElement;
    readonly siblings: readonly SurveyElement[];
    readonly keys: SurveyKeys;
    readonly onChange: (element: SurveyElement) => void;
}) {
    const t = useTranslations("Builder.editor");

    return (
        <>
            <ElementFields
                element={element}
                siblings={siblings}
                keys={keys}
                onChange={onChange}
                titleLabel={t("statementLabel")}
                titlePlaceholder={t("statementPlaceholder")}
            />
            <p className="border-t pt-3 text-[11px] leading-[1.35] text-muted-foreground">
                {t("statementHelp")}
            </p>
        </>
    );
}
