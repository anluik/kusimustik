import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { SurveyStatus } from "@/domain/survey";
import { cn } from "@/lib/utils";
import { TAG } from "@/components/type";

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
                    ? cn(
                          TAG,
                          "h-[22px] gap-1.5 rounded-full border-transparent bg-accent px-2 text-accent-foreground"
                      )
                    : cn(TAG, "h-[22px] rounded-full px-2")
            }
        >
            {status === "published" && (
                <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                />
            )}
            {t(status)}
        </Badge>
    );
}
