import type { ComparisonWave } from "@/domain/comparison";
import type { SurveyId } from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";

/**
 * One wave of a group as the comparison screens hand it to the client:
 * enough to name it, count it and match against it, and none of its
 * responses.
 */
export type GroupWave = {
    readonly surveyId: SurveyId;
    readonly waveLabel: string | null;
    readonly createdAt: string;
    readonly responseCount: number;
    /** Resolved in the wave's own language. */
    readonly elements: readonly SurveyElement[];
};

export const toComparisonWaves = (
    group: readonly GroupWave[]
): ComparisonWave[] =>
    group.map(wave => ({ surveyId: wave.surveyId, elements: wave.elements }));

/** The waves "compare all" starts from: the newest the palette can hold. */
export function newestWaves(
    group: readonly GroupWave[],
    limit: number
): GroupWave[] {
    return group.slice(-limit);
}
