import { DISPLAY } from "@/components/type";
import { cn } from "@/lib/utils";

/**
 * A section's opening: a rule, then the heading, then one line under it.
 *
 * Left-aligned and ruled rather than centred. Four centred heading-and-subhead
 * blocks stacked down a page is the arrangement this category always ships,
 * and it reads as a brochure; a rule that runs the full column and a heading
 * that starts where every other line on the page starts reads as a document,
 * which is what this product makes. The rule is also the page's only section
 * divider, the surface stays one continuous sheet, and the rhythm comes from
 * rule and row density rather than from bands of colour.
 */
export function SectionHead({
    title,
    body
}: {
    readonly title: string;
    readonly body: string;
}) {
    return (
        <div className="flex flex-col gap-3">
            <h2 className={cn(DISPLAY, "max-w-[24ch] text-balance")}>
                {title}
            </h2>
            <p className="max-w-[52ch] text-[15px] leading-[1.45] text-pretty text-muted-foreground">
                {body}
            </p>
        </div>
    );
}
