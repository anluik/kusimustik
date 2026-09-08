import type { SurveyId } from "@/domain/ids";

/**
 * Whether this visit has a response actually stored for a survey.
 *
 * Deliberately not the flag `lib/runner/analytics.ts` keeps. That one is set
 * the moment a submit is *attempted*, because an abandon beacon can fire from
 * `visibilitychange` while the request is still in flight and must not follow
 * a submit; it is optimistic on purpose. Deciding what to render from it would
 * mean a respondent whose submission failed came back to "thank you" with no
 * answers behind it — the opposite of the mistake this file exists to prevent.
 *
 * `sessionStorage`, so it lasts a reload and an app switch and no longer: the
 * same person tomorrow, or on another device, is a new visit and gets the
 * form. It is a courtesy against a habitual refresh, not one-response-per-
 * person, which nothing anonymous can enforce.
 */
const key = (surveyId: SurveyId) => `kusimustik:answered:${surveyId}`;

export function markAnswered(surveyId: SurveyId): void {
    try {
        sessionStorage.setItem(key(surveyId), "1");
    } catch {
        // A browser that refuses storage answers "no" below, which only means
        // the form comes back on a reload — where it has always come back.
    }
}

export function hasAnswered(surveyId: SurveyId): boolean {
    try {
        return sessionStorage.getItem(key(surveyId)) !== null;
    } catch {
        return false;
    }
}
