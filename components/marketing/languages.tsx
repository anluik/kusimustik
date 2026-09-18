import { SectionHead } from "@/components/marketing/section-head";
import { CODE, LABEL } from "@/components/type";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { loadMarketingMessages } from "@/lib/i18n/messages";
import { UI_LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/** The endonyms, as in the rail: someone who cannot read the page has to find
 *  their own language on it. */
const LANGUAGE_NAMES = {
    et: "Eesti",
    en: "English",
    ru: "Русский"
} as const;

/**
 * One survey written once and read in three languages, the other thing
 * neither competitor does (DECISIONS 030-033).
 *
 * The three cards are not mock-ups of the idea: each one is this page's *own*
 * demo question pulled out of that language's real catalogue. If a translation
 * were missing, this section would show it, which is the correct behaviour for
 * a section whose whole claim is that the translations exist.
 */
export async function Languages({
    shareLink,
    t
}: {
    /** The demo survey's own share link, or a bare path when there is none. */
    readonly shareLink: string;
    readonly t: MarketingTranslator;
}) {
    const catalogues = await Promise.all(
        UI_LOCALES.map(async locale => ({
            locale,
            title: (await loadMarketingMessages(locale)).Landing.demo.title
        }))
    );

    return (
        <section className="grid items-start gap-6 border-t border-border pt-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
            <SectionHead
                title={t("Landing.languages.title")}
                body={t("Landing.languages.body")}
            />
            <div className="flex min-w-0 flex-col gap-4">
                <div className="grid gap-3 md:grid-cols-3">
                    {catalogues.map(({ locale, title }) => (
                        <article
                            key={locale}
                            lang={locale}
                            className="flex flex-col gap-2.5 rounded-survey border border-border/70 bg-survey-card px-4 py-4 shadow-xs"
                        >
                            <p className={LABEL}>{LANGUAGE_NAMES[locale]}</p>
                            <p className="text-[15px] leading-[1.4] font-medium text-pretty">
                                {title}
                            </p>
                        </article>
                    ))}
                </div>

                {/* One link under all three, because that is the point: the URL
                the owner hands out does not change when a translation is
                added. Mono, because it is an identifier (DESIGN §2). */}
                <div className="flex flex-col items-start gap-1.5">
                    <p className={LABEL}>{t("Landing.languages.linkLabel")}</p>
                    <p
                        className={cn(
                            CODE,
                            "rounded-lg bg-muted px-3 py-2.5 text-foreground"
                        )}
                    >
                        {shareLink}
                    </p>
                </div>
            </div>
        </section>
    );
}
