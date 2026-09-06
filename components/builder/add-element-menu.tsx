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

/**
 * The builder's primary action, in the app bar so that it is reachable at every
 * width — the element list it appends to is hidden on a narrow viewport.
 *
 * Every one of the nine types is listed. The ones without an editor yet are
 * disabled and carry the "coming soon" badge rather than being left out
 * (DESIGN.md §6): the shape of the menu will not shift as they arrive, and the
 * owner can see what the product is going to do.
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
                    // DESIGN §6: disabled is a colour change, never an opacity
                    // one — opacity stacking breaks the audited contrast.
                    className="rounded text-xs text-input opacity-100!"
                >
                    <Icon aria-hidden />
                    <span>{label}</span>
                    <Badge
                        variant="outline"
                        className="ml-auto h-4 rounded px-1 font-mono text-[9px] leading-none tracking-[0.04em] text-input uppercase"
                    >
                        {tCommon("comingSoon")}
                    </Badge>
                </DropdownMenuItem>
            );
        }

        return (
            <DropdownMenuItem
                key={type}
                className="rounded text-xs"
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
                <Button size="sm" className="h-[30px] rounded text-xs">
                    <Plus aria-hidden />
                    {t("label")}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded">
                <DropdownMenuLabel className="font-mono text-[10px] leading-none tracking-[0.07em] text-muted-foreground uppercase">
                    {t("menuLabel")}
                </DropdownMenuLabel>
                {ELEMENT_TYPES.map(item)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
