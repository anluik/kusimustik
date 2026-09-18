import { Link2 } from "lucide-react";
import { Bar } from "@/components/marketing/bar";
import { Plate } from "@/components/marketing/plate";
import { SectionHead } from "@/components/marketing/section-head";
import { LABEL } from "@/components/type";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { cn } from "@/lib/utils";

/**
 * The differentiator neither competitor has: the same question, two years
 * apart, held together by a match the owner made rather than one the product
 * guessed (DECISIONS 035).
 *
 * Demonstration data, labelled on the plate, see the note in `scale.tsx`.
 * The two waves are given different figures deliberately: a comparison where
 * nothing moved would illustrate the feature without showing why anyone wants
 * it.
 */
const WAVES = [
    { label: "2025", satisfied: 58.7, chart: "var(--chart-1)" },
    // 2026 is the top two steps of `scale.tsx`'s distribution, 32,0 + 39,3.
    // Both plates title the same question, so a reader who adds those bars up
    // is entitled to get this number; the two used to disagree by 3,6pp.
    { label: "2026", satisfied: 71.3, chart: "var(--chart-2)" }
] as const;

export function Waves({ t }: { readonly t: MarketingTranslator }) {
    const percent = new Intl.NumberFormat("et-EE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });

    return (
        <section className="grid items-start gap-6 border-t border-border pt-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
            <SectionHead
                title={t("Landing.waves.title")}
                body={t("Landing.waves.body")}
            />
            <div className="flex min-w-0 flex-col gap-4">
                <Plate
                    label={`${t("Landing.waves.demoQuestion")}, ${t("Landing.waves.metric")}`}
                    aside={t("Landing.scale.demoLabel")}
                    className="w-full max-w-[720px]"
                >
                    {/* The matched row is the artifact: two waves side by side,
                    oldest left, each carrying its own legend swatch, dots,
                    never bordered rectangles (DESIGN §7). The link glyph
                    between them is the match itself, which is a thing the
                    owner made and the one piece of state worth naming. */}
                    <div className="flex flex-col gap-3.5">
                        {WAVES.map(wave => (
                            <div
                                key={wave.label}
                                className="flex items-center gap-3"
                            >
                                <span
                                    aria-hidden
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: wave.chart }}
                                />
                                <span className={cn(LABEL, "w-9 shrink-0")}>
                                    {wave.label}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <Bar
                                        label={wave.label}
                                        labelHidden
                                        percent={wave.satisfied}
                                        value={`${percent.format(wave.satisfied)}%`}
                                        fill={wave.chart}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="flex items-center gap-1.5 border-t border-border pt-3 text-[12px] leading-none text-muted-foreground">
                        <Link2 aria-hidden className="size-3.5 shrink-0" />
                        {t("Landing.waves.matched")}
                    </p>
                </Plate>
            </div>
        </section>
    );
}
