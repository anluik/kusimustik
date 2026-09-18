"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { UI } from "@/components/type";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function isTheme(value: string | undefined): value is Theme {
    return value !== undefined && (THEMES as readonly string[]).includes(value);
}

/**
 * The landing page's appearance control.
 *
 * The same three choices as `components/shell/theme-toggle.tsx`, but built from
 * plain buttons rather than the `Tabs` primitive: this rail is a row of quiet
 * text links (the languages beside it are anchors), and a filled tab list here
 * would be the loudest thing in the page's footer.
 *
 * Nothing is selected until mount. `next-themes` only knows the answer in the
 * browser, so rendering a selection on the server is a hydration mismatch, and
 * this page is static: the server has no opinion about appearance to render.
 * Before mount every option is simply unmarked, which is honest rather than
 * wrong.
 */
export function ThemeChoice() {
    const t = useTranslations("Landing");
    const { theme, setTheme } = useTheme();
    const mounted = useMounted();
    const current = mounted && isTheme(theme) ? theme : null;

    return (
        <div
            role="group"
            aria-label={t("theme.label")}
            className="-ml-2 flex flex-wrap items-center gap-1"
        >
            {THEMES.map(option => {
                const selected = option === current;
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => setTheme(option)}
                        {...(selected && { "aria-pressed": true })}
                        className={cn(
                            UI,
                            "rounded-lg px-2 py-2 transition-colors outline-none",
                            "focus-visible:ring-[3px] focus-visible:ring-ring/18",
                            selected
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t(`theme.${option}`)}
                    </button>
                );
            })}
        </div>
    );
}
