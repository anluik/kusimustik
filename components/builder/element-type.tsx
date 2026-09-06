"use client";

import {
    ChevronsUpDown,
    CircleDot,
    Gauge,
    Grid3x3,
    ListChecks,
    Pilcrow,
    Quote,
    Star,
    TextCursorInput,
    type LucideIcon
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { ElementType } from "@/domain/question";

/**
 * The type's two presentations: an icon for the dense element list and a
 * translated name for everywhere the owner reads one.
 *
 * A `Record<ElementType, …>` rather than a switch on purpose — it is a total
 * mapping with no narrowing to do, and a missing entry is the same build error
 * an unhandled `case` would be.
 */
export const ELEMENT_ICONS: Record<ElementType, LucideIcon> = {
    statement: Quote,
    single_choice: CircleDot,
    multi_choice: ListChecks,
    dropdown: ChevronsUpDown,
    short_text: TextCursorInput,
    long_text: Pilcrow,
    opinion_scale: Gauge,
    nps: Star,
    matrix_single: Grid3x3
};

/** `t` for element type names, so callers need not know the namespace. */
export function useElementTypeName(): (type: ElementType) => string {
    const t = useTranslations("Builder.elementTypes");
    return type => t(type);
}
