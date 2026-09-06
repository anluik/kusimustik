import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { SurveyStatus } from "@/domain/survey";

/**
 * DESIGN.md §5: draft `secondary`, published `default` restyled to the accent
 * pair with a primary dot, closed `outline`. §2: status badges are the Tag
 * level — Mono 9px, uppercase.
 *
 * The dot is why published is not simply a colour: colour alone never carries
 * state (§4), so the live survey is the one with a mark next to it.
 */
export function SurveyStatusBadge({
    status
}: {
    readonly status: SurveyStatus;
}) {
    const t = useTranslations("Surveys.status");

    const variant = status === "draft" ? "secondary" : "outline";

    return (
        <Badge
            variant={variant}
            className={
                status === "published"
                    ? "h-5 gap-1.5 rounded border-transparent bg-accent px-1.5 font-mono text-[9px] leading-none tracking-[0.04em] text-accent-foreground uppercase"
                    : "h-5 rounded px-1.5 font-mono text-[9px] leading-none tracking-[0.04em] uppercase"
            }
        >
            {status === "published" && (
                <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-4xl bg-primary"
                />
            )}
            {t(status)}
        </Badge>
    );
}
