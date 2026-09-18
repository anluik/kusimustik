import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeChoice } from "@/components/marketing/theme-choice";
import { UI } from "@/components/type";
import { DEFAULT_LOCALE, UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** The endonyms, as in the rail. */
const LANGUAGE_NAMES: Record<UiLocale, string> = {
    et: "Eesti",
    en: "English",
    ru: "Русский"
};

/**
 * The page's foot: the mark, the language links, the appearance control and a
 * quiet way in.
 *
 * Appearance lives here rather than in the top rail. It is a preference, not a
 * destination, nobody arrives wanting it, and the rail at 390px already has
 * to wrap to fit a wordmark, three endonyms and a button.
 */
export function Footer({
    locale,
    t
}: {
    readonly locale: UiLocale;
    readonly t: MarketingTranslator;
}) {
    return (
        <footer className="flex flex-col gap-4 border-t border-border pt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2">
                    <BrandMark className="size-4 shrink-0 text-primary" />
                    <span className="text-[13px] leading-none font-medium">
                        Inquirdi
                    </span>
                </span>

                <nav
                    aria-label={t("Landing.nav.languageLabel")}
                    className="-ml-2 flex flex-wrap items-center gap-1"
                >
                    {UI_LOCALES.map(candidate => {
                        const current = candidate === locale;
                        return (
                            <a
                                key={candidate}
                                href={
                                    candidate === DEFAULT_LOCALE
                                        ? ROUTES.home
                                        : ROUTES.homeInLocale(candidate)
                                }
                                hrefLang={candidate}
                                {...(current && { "aria-current": "page" })}
                                className={cn(
                                    UI,
                                    "rounded-lg px-2 py-2 transition-colors outline-none",
                                    "focus-visible:ring-[3px] focus-visible:ring-ring/18",
                                    current
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {LANGUAGE_NAMES[candidate]}
                            </a>
                        );
                    })}
                </nav>

                <a
                    href={ROUTES.login}
                    className={cn(
                        UI,
                        "ml-auto rounded-lg px-2 py-2 text-muted-foreground transition-colors outline-none",
                        "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/18"
                    )}
                >
                    {t("Landing.footer.signIn")}
                </a>
            </div>

            <ThemeChoice />
        </footer>
    );
}
