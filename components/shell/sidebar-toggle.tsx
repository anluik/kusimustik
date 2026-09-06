"use client";

import { PanelLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

/**
 * Not `SidebarTrigger`: the generated component hardcodes an English
 * screen-reader label and `components/ui/` is never hand-edited (DESIGN §5).
 * Same primitive, same behaviour, translated label.
 */
export function SidebarToggle() {
    const t = useTranslations("Nav");
    const { toggleSidebar } = useSidebar();

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            className="rounded"
            onClick={toggleSidebar}
        >
            <PanelLeftIcon aria-hidden />
            <span className="sr-only">{t("toggleSidebar")}</span>
        </Button>
    );
}
