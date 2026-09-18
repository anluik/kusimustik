import { BrandMark } from "@/components/shell/brand-mark";
import { TITLE, UI } from "@/components/type";
import { DEFAULT_LOCALE, UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** The endonyms, deliberately the same three strings in every catalogue. */
const LANGUAGE_NAMES: Record<UiLocale, string> = {
    et: "Eesti",
    en: "English",
    ru: "Русский"
};

/**
 * The page's one piece of chrome: 48px, a hairline, and nothing in it that is
 * not the mark, the language or the way in (DESIGN §4's app-bar height, since
 * this is the same product).
 *
 * The languages are links to distinct URLs rather than a control that writes a
 * preference, the same reasoning as the runner's picker (DECISIONS 033) and
 * the reason this page can be static at all. `<a>` rather than `next/link`:
 * the language is `<html lang>` and the whole catalogue, both decided in the
 * root layout, and a document load is the one navigation certain to bring
 * every part of it.
 *
 * Sign in is a plain link to `/login`, which is also the account-creation
 * path, it is one magic-link form either way. A visitor who is already signed
 * in is bounced from there to their surveys by the proxy, so this one static
 * page serves both without reading a thing about the request.
 */
export function Rail({
    locale,
    t
}: {
    readonly locale: UiLocale;
    readonly t: MarketingTranslator;
}) {
    return (
        <header className="border-b border-border">
            {/* Two rows on a phone, one from `sm` up. Three endonyms, a
                wordmark and a button do not fit across 390px, and the thing
                that loses is always the product's own name, it was rendering
                as "Kü…". Wrapping costs a row; truncating costs the name. */}
            <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:h-12 sm:flex-nowrap sm:py-0">
                <a
                    href={ROUTES.home}
                    className="order-1 flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/18"
                >
                    <BrandMark className="size-5 shrink-0 text-primary" />
                    <span className={TITLE}>Inquirdi</span>
                </a>

                <nav
                    aria-label={t("Landing.nav.languageLabel")}
                    className="order-3 -ml-2 flex w-full items-center gap-1 sm:order-2 sm:ml-auto sm:w-auto"
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
                        "order-2 ml-auto shrink-0 rounded-lg border border-border px-3 py-2.5 font-medium transition-colors outline-none sm:order-3 sm:ml-0",
                        "hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/18"
                    )}
                >
                    {t("Landing.nav.signIn")}
                </a>
            </div>
        </header>
    );
}
