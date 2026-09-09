import "server-only";

import { cache } from "react";

import type { SurveyLocale } from "@/domain/survey";
import { SurveySlugSchema } from "@/domain/survey";
import type { RunnerSurvey } from "@/lib/db/surveys";
import { getRunnerSurveyBySlug } from "@/lib/db/surveys";
import { createPublicDb } from "@/lib/supabase/public";

/**
 * The runner's read. Wrapped in `cache` so the root layout — which needs the
 * language for `<html lang>` — and the page below it share one query per
 * request rather than each making their own. Both derive `locale` from the
 * same URL segment through `readLocaleSegment`, so both hit the same entry.
 *
 * The slug is parsed before it reaches the database: it arrives from the URL,
 * and `/k/<400 characters of junk>` should cost a schema check rather than a
 * round trip. A malformed slug is indistinguishable from a missing survey,
 * which is what it is.
 */
export const loadRunnerSurvey = cache(
    async (
        slug: string,
        locale?: SurveyLocale
    ): Promise<RunnerSurvey | null> => {
        const parsed = SurveySlugSchema.safeParse(slug);
        if (!parsed.success) return null;
        return getRunnerSurveyBySlug(createPublicDb(), parsed.data, locale);
    }
);
