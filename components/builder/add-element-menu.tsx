"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    ELEMENT_ICONS,
    useElementTypeName
} from "@/components/builder/element-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ELEMENT_TYPES, type ElementType } from "@/domain/question";
import {
    isCreatableType,
    type CreatableElementType
} from "@/lib/builder/new-element";
import { LABEL, TAG } from "@/components/type";
import { cn } from "@/lib/utils";

/**
 * The builder's primary action, in the app bar so that it is reachable at every
 * width — the element list it appends to is hidden on a narrow viewport.
 *
 * Every one of the nine types is listed, and as of the end of Phase 5 every
 * one of them is creatable — so the disabled branch below draws nothing today.
 * It stays because it is the state DESIGN.md §6 specifies for a type that will
 * exist later: listed, disabled, carrying the "coming soon" badge rather than
 * left out, so the shape of the menu does not shift as it arrives. A tenth
 * type added to the union but not yet to `CREATABLE_ELEMENT_TYPES` lands here
 * on its own.
 */
export function AddElementMenu({
    onAdd
}: {
    readonly onAdd: (type: CreatableElementType) => void;
}) {
    const t = useTranslations("Builder.add");
    const tCommon = useTranslations("Common");
    const typeName = useElementTypeName();

    const item = (type: ElementType) => {
        const Icon = ELEMENT_ICONS[type];
        const label = typeName(type);

        if (!isCreatableType(type)) {
            return (
                <DropdownMenuItem
                    key={type}
                    disabled
                    // Coloured, not dimmed: app/globals.css (DESIGN §6).
                    className="rounded-lg text-xs"
                >
                    <Icon aria-hidden />
                    <span>{label}</span>
                    <Badge
                        variant="outline"
                        className={cn(
                            TAG,
                            "ml-auto h-4 rounded-lg px-1 text-input"
                        )}
                    >
                        {tCommon("comingSoon")}
                    </Badge>
                </DropdownMenuItem>
            );
        }

        return (
            <DropdownMenuItem
                key={type}
                className="rounded-lg text-xs"
                onSelect={() => onAdd(type)}
            >
                <Icon aria-hidden />
                <span>{label}</span>
            </DropdownMenuItem>
        );
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-[30px] rounded-lg text-xs">
                    <Plus aria-hidden />
                    {t("label")}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-lg">
                <DropdownMenuLabel className={LABEL}>
                    {t("menuLabel")}
                </DropdownMenuLabel>
                {ELEMENT_TYPES.map(item)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
