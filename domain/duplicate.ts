import {
    newQuestionId,
    newSurveyId,
    newWaveGroupId,
    questionId,
    surveyId
} from "@/domain/ids";
import { AuthoredSurveySchema } from "@/domain/survey";
import type { AuthoredSurvey } from "@/domain/survey";

export type DuplicateSurveyOptions = {
    /** Defaults to the source title: a new wave is the same survey, run again. */
    readonly title?: string;
    /** A new label for the copy. `null` clears it; omitted keeps the source's. */
    readonly waveLabel?: string | null;
    /**
     * Set when the copy is a starting point for an unrelated survey rather than
     * the next wave of this one. It then gets its own wave group and will never
     * appear in the source's comparisons.
     */
    readonly newWaveGroup?: boolean;
    /** Injection points for deterministic ids in tests and seed scripts. */
    readonly generateSurveyId?: () => string;
    readonly generateQuestionId?: () => string;
};

/**
 * Copies a survey definition for a new wave.
 *
 * Fresh survey id, fresh question ids, **the same question keys** and **the
 * same wave group** — that combination is what keeps year-over-year comparison
 * joined up after the questions have been reworded. Getting it wrong is silent
 * and only surfaces a year later, which is why it has its own test file.
 *
 * The copy comes back as a draft with no slug, so it cannot take over the
 * source's public link.
 *
 * It works on the stored document rather than on one language of it, so a
 * survey translated into three carries all three into its next wave. Nothing
 * here touches a word: only ids change.
 */
export function duplicateSurvey(
    survey: AuthoredSurvey,
    options: DuplicateSurveyOptions = {}
): AuthoredSurvey {
    const {
        title,
        waveLabel,
        newWaveGroup,
        generateSurveyId,
        generateQuestionId
    } = options;

    const nextQuestionId = generateQuestionId
        ? () => questionId(generateQuestionId())
        : newQuestionId;

    const label =
        waveLabel === undefined ? survey.waveLabel : (waveLabel ?? undefined);

    return AuthoredSurveySchema.parse({
        ...structuredClone(survey),
        id: generateSurveyId ? surveyId(generateSurveyId()) : newSurveyId(),
        title: title ?? survey.title,
        status: "draft",
        slug: null,
        waveGroupId: newWaveGroup ? newWaveGroupId() : survey.waveGroupId,
        ...(label === undefined
            ? { waveLabel: undefined }
            : { waveLabel: label }),
        elements: survey.elements.map(element => ({
            ...structuredClone(element),
            id: nextQuestionId()
        }))
    });
}
