"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMounted } from "@/hooks/use-mounted";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function isTheme(value: string): value is Theme {
    return (THEMES as readonly string[]).includes(value);
}

/**
 * The same choice as the user menu offers, in the shape Settings wants. Value
 * stays empty until mount: next-themes only knows the answer in the browser,
 * and rendering a selection before then is a hydration mismatch.
 */
export function ThemeToggle() {
    const t = useTranslations("Theme");
    const { theme, setTheme } = useTheme();
    const mounted = useMounted();

    return (
        <Tabs
            value={
                mounted && theme !== undefined && isTheme(theme) ? theme : ""
            }
            onValueChange={value => {
                if (isTheme(value)) setTheme(value);
            }}
        >
            <TabsList
                aria-label={t("label")}
                className="grid h-7 w-full grid-cols-3 rounded p-0.5"
            >
                {THEMES.map(option => (
                    <TabsTrigger
                        key={option}
                        value={option}
                        className="h-6 rounded text-xs leading-none"
                    >
                        {t(option)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
