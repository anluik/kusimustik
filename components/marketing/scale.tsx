import { Bar } from "@/components/marketing/bar";
import { Plate } from "@/components/marketing/plate";
import { SectionHead } from "@/components/marketing/section-head";
import type { MarketingTranslator } from "@/lib/i18n/marketing";
import { rampFill, rampStep } from "@/lib/results/ramp";

/**
 * Demonstration data, and labelled as such on the page.
 *
 * PRODUCT.md is explicit that this product has no usage numbers, customers or
 * benchmarks to show and may not invent any. This is neither: it is one
 * question's distribution, drawn at full fidelity so the reader can see what
 * the shape of an answered survey looks like, with the word "demonstration
 * data" sitting on the plate. A claim would be "300 organisations"; this is
 * "here is what 300 answers look like".
 */
const DEMO_DISTRIBUTION = [
    { label: "5", count: 118 },
    { label: "4", count: 96 },
    { label: "3", count: 52 },
    { label: "2", count: 21 },
    { label: "1", count: 13 }
] as const;

const DEMO_TOTAL = DEMO_DISTRIBUTION.reduce(
    (total, step) => total + step.count,
    0
);

export function Scale({ t }: { readonly t: MarketingTranslator }) {
    // Estonian conventions regardless of the page's language (DESIGN §9):
    // comma decimal, so `39,3%`.
    const percent = new Intl.NumberFormat("et-EE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });

    return (
        <section className="grid items-start gap-6 border-t border-border pt-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
            <SectionHead
                title={t("Landing.scale.title")}
                body={t("Landing.scale.body")}
            />
            <div className="flex min-w-0 flex-col gap-4">
                {/* A plot is capped at 720px (DESIGN §3): a bar running a metre
                across a wide monitor is harder to compare than one that does
                not. */}
                <Plate
                    label={t("Landing.scale.demoQuestion")}
                    aside={t("Landing.scale.demoLabel")}
                    className="w-full max-w-[720px]"
                >
                    <div className="flex flex-col gap-3">
                        {/* Ordered data, so the ramp and only the ramp (§7), with
                        the step read from the shared helper rather than picked
                        by eye. Drawn 1 at the top through 5 at the bottom, so
                        the ramp darkens down the plate in step with the scale.
                        `DEMO_DISTRIBUTION` is written 5-first for readability,
                        which is why it is reversed here. */}
                        {[...DEMO_DISTRIBUTION].reverse().map((step, index) => {
                            const share = (step.count / DEMO_TOTAL) * 100;
                            return (
                                <Bar
                                    key={step.label}
                                    label={step.label}
                                    percent={share}
                                    value={`${percent.format(share)}%`}
                                    fill={rampFill(
                                        rampStep(
                                            index,
                                            DEMO_DISTRIBUTION.length
                                        )
                                    )}
                                    bordered
                                />
                            );
                        })}
                    </div>
                </Plate>
            </div>
        </section>
    );
}
