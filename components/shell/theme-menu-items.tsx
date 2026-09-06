"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import {
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu";
import { useMounted } from "@/hooks/use-mounted";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function isTheme(value: string | undefined): value is Theme {
    return (THEMES as readonly (string | undefined)[]).includes(value);
}

/**
 * The theme is only known once the client has mounted — next-themes resolves it
 * from `localStorage` and the system preference. Rendering the group with no
 * selection until then keeps the server and first client render identical.
 */
export function ThemeMenuItems() {
    const t = useTranslations("Theme");
    const { theme, setTheme } = useTheme();
    const mounted = useMounted();

    return (
        <>
            <DropdownMenuLabel className="font-mono text-[10px] tracking-[0.07em] uppercase">
                {t("label")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
                value={mounted && isTheme(theme) ? theme : ""}
                onValueChange={value => {
                    if (isTheme(value)) setTheme(value);
                }}
            >
                {THEMES.map(option => (
                    <DropdownMenuRadioItem
                        key={option}
                        value={option}
                        className="text-xs"
                    >
                        {t(option)}
                    </DropdownMenuRadioItem>
                ))}
            </DropdownMenuRadioGroup>
        </>
    );
}
