import { aggregate } from "@/domain/aggregate";
import type { QuestionSummary } from "@/domain/aggregate";
import type { SurveyId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type {
    AnswerableQuestion,
    ElementType,
    SurveyElement
} from "@/domain/question";
import { answersForQuestion } from "@/lib/db/responses";
import type { WaveResponses } from "@/lib/db/waves";

/**
 * Wave comparison: the same question, across the waves of one recurring survey.
 *
 * **Everything here joins on `key`.** A wave is a duplicate of its predecessor
 * with fresh question ids and the same keys (docs/DECISIONS.md 003), so `id`
 * would match nothing across two waves and the title is the one thing owners
 * routinely change between them. `key` is the only identity that survives both,
 * and `survey_questions_survey_key_idx` (024) is what makes it unambiguous —
 * one key belongs to one question for the life of a survey, tombstones
 * included.
 *
 * `aggregate()` is called once per wave per question, over that wave's own
 * definition and its own responses. It knows nothing about waves and does not
 * need to: a wave is a survey, and the comparison is what places its summaries
 * beside each other.
 *
 * Two cases had to be decided rather than improvised, both of them "a column
 * that exists for some waves" (docs/DECISIONS.md 029):
 *
 * - A key **absent** from a wave's document. The wave did not ask it, so it has
 *   no summary and no series point, and the card says so. Rendering nought
 *   would claim nobody chose anything, which is a different and false finding.
 * - A key present but carrying a **different type** — the author replaced a
 *   five-point scale with an NPS question and kept the key. The two are not
 *   comparable and the summaries are not even the same shape, so the wave is
 *   reported as incomparable rather than charted.
 *
 * A question tombstoned in a later wave (008) reaches this the same way: its
 * key left that wave's document, so that wave is `absent` and the waves that
 * still ask it compare normally.
 */

/**
 * How many waves are compared at once.
 *
 * DESIGN §7 caps the categorical palette at five and forbids reaching for a
 * sixth colour, and in a comparison the wave *is* the category. So the screen
 * compares the five most recent waves and says how many older ones it left
 * out, rather than growing a palette the audit does not support.
 */
export const MAX_COMPARED_WAVES = 5;

export type WaveHeader = {
    readonly surveyId: SurveyId;
    readonly title: string;
    /** Free text ("2026", "Q1"); null when the owner never set one. */
    readonly waveLabel: string | null;
    readonly responseCount: number;
};

export type WaveCell =
    /** The wave asked this question, and here is what it answered. */
    | { readonly state: "compared"; readonly summary: QuestionSummary }
    /** The key is not in this wave's document: it did not ask this. */
    | { readonly state: "absent" }
    /** The key is here, but on a different kind of element. */
    | { readonly state: "mismatched"; readonly type: ElementType };

export type ComparedQuestion = {
    readonly key: string;
    /**
     * The question as the newest wave that still asks it defines it — its
     * wording, its options and their order. Older waves keep their own
     * definitions in their own summaries; this is what the card is titled with
     * and what the series are aligned against.
     */
    readonly question: AnswerableQuestion;
    /** One per compared wave, in the same order as `waves`. */
    readonly cells: readonly WaveCell[];
    /** How many waves actually contribute a summary. */
    readonly comparedCount: number;
    /** How many waves did not ask it, or asked something else under its key. */
    readonly missingCount: number;
};

export type WaveComparison = {
    readonly waves: readonly WaveHeader[];
    readonly questions: readonly ComparedQuestion[];
    /** Waves too old to fit `MAX_COMPARED_WAVES`. Reported, never dropped silently. */
    readonly omittedWaveCount: number;
};

function toHeader(wave: WaveResponses): WaveHeader {
    return {
        surveyId: wave.survey.id,
        title: wave.survey.title,
        waveLabel: wave.survey.waveLabel ?? null,
        responseCount: wave.responses.length
    };
}

/** The wave's element under this key, or undefined — statements included. */
function elementByKey(
    wave: WaveResponses,
    key: string
): SurveyElement | undefined {
    return wave.survey.elements.find(element => element.key === key);
}

function toCell(wave: WaveResponses, question: AnswerableQuestion): WaveCell {
    const element = elementByKey(wave, question.key);
    if (element === undefined) return { state: "absent" };
    if (!isAnswerableElement(element) || element.type !== question.type) {
        return { state: "mismatched", type: element.type };
    }

    // Same key, same type: the same question, however it has been reworded.
    // It is aggregated against *this* wave's own definition, so a wave that
    // added an option counts it rather than reporting it as unshown.
    return {
        state: "compared",
        summary: aggregate(
            element,
            answersForQuestion(wave.responses, element.id)
        )
    };
}

/**
 * Aligns the waves on key and summarises each one.
 *
 * Waves arrive oldest first, as the repository returns them, and stay in that
 * order: a comparison reads left to right in time. The questions are ordered by
 * the newest wave's document, so the screen matches the questionnaire as it
 * stands today; keys that only older waves have follow, in the order those
 * waves list them, rather than disappearing because the current wave dropped
 * them.
 */
export function buildWaveComparison(
    waves: readonly WaveResponses[]
): WaveComparison {
    const compared = waves.slice(-MAX_COMPARED_WAVES);
    const newestFirst = [...compared].reverse();

    const questions: ComparedQuestion[] = [];
    const seen = new Set<string>();

    for (const wave of newestFirst) {
        for (const element of wave.survey.elements) {
            if (!isAnswerableElement(element)) continue;
            if (seen.has(element.key)) continue;
            seen.add(element.key);

            const cells = compared.map(other => toCell(other, element));
            questions.push({
                key: element.key,
                question: element,
                cells,
                comparedCount: cells.filter(cell => cell.state === "compared")
                    .length,
                missingCount: cells.filter(cell => cell.state !== "compared")
                    .length
            });
        }
    }

    return {
        waves: compared.map(toHeader),
        questions,
        omittedWaveCount: waves.length - compared.length
    };
}
