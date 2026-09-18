import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { DISPLAY } from "@/components/type";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The way in, at the end rather than the top: by here the visitor has answered
 * a question, seen it land three ways, and read the two things this product
 * does that its competitors do not. The action is one link to `/login`, which
 * is the same magic-link form whether the address it is given is new or not -
 * there is no separate sign-up route to send them to, and PRODUCT.md forbids
 * naming a price, a plan or a free tier, because none exists.
 *
 * The secondary action appears only when there really is a published demo
 * survey to answer.
 */
export function Close({
    demoHref,
    t
}: {
    readonly demoHref: string | null;
    readonly t: MarketingTranslator;
}) {
    return (
        <section className="flex flex-col items-center gap-6 border-t border-border pt-12">
            <div className="flex max-w-[620px] flex-col items-center gap-2 text-center">
                <BrandMark className="size-8 text-primary" />
                <h2 className={cn(DISPLAY, "text-balance")}>
                    {t("Landing.close.title")}
                </h2>
                <p className="text-[15px] leading-[1.45] text-pretty text-muted-foreground">
                    {t("Landing.close.body")}
                </p>
            </div>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
                <a
                    href={ROUTES.login}
                    className={cn(
                        "inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-[15px] leading-none font-medium text-primary-foreground shadow-xs transition-colors outline-none",
                        "hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/18"
                    )}
                >
                    {t("Landing.close.action")}
                    <ArrowRight aria-hidden className="size-4 shrink-0" />
                </a>

                {demoHref !== null && (
                    <a
                        href={demoHref}
                        className={cn(
                            "inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-[15px] leading-none font-medium transition-colors outline-none",
                            "hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/18"
                        )}
                    >
                        {t("Landing.close.demoAction")}
                    </a>
                )}
            </div>
        </section>
    );
}
