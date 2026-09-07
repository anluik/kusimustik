"use client";

import { useTranslations } from "next-intl";

import { TAG } from "@/components/results/type";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChartKind } from "@/domain/charts";
import { cn } from "@/lib/utils";

/**
 * The per-question chart switcher (PLAN Phase 7).
 *
 * It renders whatever `chartKindsFor` returned and nothing else — the menu is
 * derived from the question type, not filtered here, so this component has no
 * opinion about which encodings exist and cannot acquire one. See
 * docs/DECISIONS.md 017.
 *
 * A question with one available encoding gets no switcher at all: a control
 * with a single option is furniture.
 */
export function ChartSwitcher({
    kinds,
    value,
    onChange
}: {
    readonly kinds: readonly ChartKind[];
    readonly value: ChartKind;
    readonly onChange: (kind: ChartKind) => void;
}) {
    const t = useTranslations("Results.chart");

    if (kinds.length < 2) return null;

    return (
        <Tabs
            value={value}
            onValueChange={next => {
                // `Tabs` hands back a string; only a kind this question offers
                // is accepted, so a stale value can never be selected.
                const kind = kinds.find(candidate => candidate === next);
                if (kind !== undefined) onChange(kind);
            }}
        >
            <TabsList aria-label={t("label")} className="h-7 rounded p-0.5">
                {kinds.map(kind => (
                    <TabsTrigger
                        key={kind}
                        value={kind}
                        className={cn(TAG, "h-6 rounded px-2")}
                    >
                        {t(`kind.${kind}`)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
