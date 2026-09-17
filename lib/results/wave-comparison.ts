import { aggregate } from "@/domain/aggregate";
import type { QuestionSummary } from "@/domain/aggregate";
import type { ComparisonRow, ComparisonWave } from "@/domain/comparison";
import { matchVerdict, orderRows } from "@/domain/comparison";
import type { ComparisonRowId, QuestionId, SurveyId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { AnswerableQuestion, ElementType } from "@/domain/question";
import { answersForQuestion } from "@/lib/db/responses";
import type { RemovedQuestion, WaveResponses } from "@/lib/db/waves";

/**
 * A saved comparison, drawn: each row's questions summarised wave by wave.
 *
 * **What is compared is the owner's decision** (docs/DECISIONS.md 035). This
 * module never infers a match — it reads the rows the owner saved and says,
 * per wave, what each one holds:
 *
 * - **compared**: the wave's question, summarised by `aggregate()` against the
 *   wave's own definition and its own answers. A question removed from its
 *   wave after it was answered is still compared, against the last definition
 *   it had (`removed` is set so the card can say so).
 * - **notMatched**: the row has no question from this wave. Nought would claim
 *   the wave asked and nobody answered, which is a different and false finding.
 * - **mismatched**: the row holds a question that no longer satisfies the
 *   matching rules — its type changed in the builder after it was matched. It
 *   is named on the card and not drawn; the summaries would not even be the
 *   same shape.
 *
 * It runs on the server: the client receives summaries, not every response of
 * every wave.
 */

export type WaveHeader = {
    readonly surveyId: SurveyId;
    readonly title: string;
    /** Free text ("2026", "Q1"); null when the owner never set one. */
    readonly waveLabel: string | null;
    /** When the wave was created — the unlabelled wave's name. */
    readonly createdAt: string;
    readonly responseCount: number;
};

export type WaveCell =
    | {
          readonly state: "compared";
          readonly summary: QuestionSummary;
          /** The question has left its wave; summarised from its last definition. */
          readonly removed: boolean;
      }
    /** The row holds no question from this wave. */
    | { readonly state: "notMatched" }
    /** The row's question from this wave breaks the matching rules now. */
    | { readonly state: "mismatched"; readonly type: ElementType };

export type ComparedRow = {
    readonly id: ComparisonRowId;
    /**
     * The question the card is titled with and the series are aligned against:
     * the newest one the most others in the row agree with. Older waves keep
     * their own definitions in their own summaries.
     */
    readonly question: AnswerableQuestion;
    /** One per compared wave, in the same order as `waves`. */
    readonly cells: readonly WaveCell[];
    /** How many waves contribute a summary. */
    readonly comparedCount: number;
    /** How many do not: not matched, or no longer comparable. */
    readonly missingCount: number;
};

export type WaveComparison = {
    readonly waves: readonly WaveHeader[];
    readonly rows: readonly ComparedRow[];
};

type Located = {
    readonly question: AnswerableQuestion;
    readonly removed: boolean;
};

function toHeader(wave: WaveResponses): WaveHeader {
    return {
        surveyId: wave.survey.id,
        title: wave.survey.title,
        waveLabel: wave.survey.waveLabel ?? null,
        createdAt: wave.createdAt,
        responseCount: wave.responses.length
    };
}

/**
 * The row's anchor: of its questions, the one the most others agree with, and
 * of those the newest. A single question retyped in one wave then marks that
 * wave as the odd one out, rather than the other four.
 */
function anchorOf(
    located: readonly (Located | undefined)[]
): AnswerableQuestion | undefined {
    const present = located
        .map(entry => entry?.question)
        .filter(
            (question): question is AnswerableQuestion => question !== undefined
        )
        .reverse();

    let best: AnswerableQuestion | undefined;
    let bestScore = -1;
    for (const candidate of present) {
        const score = present.filter(
            other => matchVerdict(candidate, other).ok
        ).length;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

/**
 * Draws the owner's rows over the waves they cover.
 *
 * `waves` are the comparison's own, oldest first, with their responses;
 * `removed` holds the last definitions of matched questions that have left
 * their waves (`listRemovedQuestions`). Rows come back in questionnaire order
 * (`orderRows`), and a row with nothing left to show in any wave is dropped.
 */
export function buildComparison({
    waves,
    rows,
    removed
}: {
    readonly waves: readonly WaveResponses[];
    readonly rows: readonly ComparisonRow[];
    readonly removed: ReadonlyMap<QuestionId, RemovedQuestion>;
}): WaveComparison {
    const definitions: ComparisonWave[] = waves.map(wave => ({
        surveyId: wave.survey.id,
        elements: wave.survey.elements
    }));

    const live = new Map<QuestionId, SurveyId>();
    const questions = new Map<QuestionId, AnswerableQuestion>();
    for (const wave of waves) {
        for (const element of wave.survey.elements) {
            if (!isAnswerableElement(element)) continue;
            live.set(element.id, wave.survey.id);
            questions.set(element.id, element);
        }
    }

    const locate = (
        surveyId: SurveyId,
        questionId: QuestionId
    ): Located | undefined => {
        if (live.get(questionId) === surveyId) {
            const question = questions.get(questionId);
            return question === undefined
                ? undefined
                : { question, removed: false };
        }
        const gone = removed.get(questionId);
        return gone?.surveyId === surveyId
            ? { question: gone.question, removed: true }
            : undefined;
    };

    const compared: ComparedRow[] = [];
    for (const row of orderRows(definitions, rows)) {
        const located = waves.map(wave => {
            const match = row.matches.find(m => m.surveyId === wave.survey.id);
            return match === undefined
                ? undefined
                : locate(wave.survey.id, match.questionId);
        });

        const anchor = anchorOf(located);
        if (anchor === undefined) continue;

        const cells = waves.map((wave, index): WaveCell => {
            const entry = located[index];
            if (entry === undefined) return { state: "notMatched" };
            if (!matchVerdict(anchor, entry.question).ok) {
                return { state: "mismatched", type: entry.question.type };
            }
            return {
                state: "compared",
                removed: entry.removed,
                summary: aggregate(
                    entry.question,
                    answersForQuestion(wave.responses, entry.question.id)
                )
            };
        });

        const comparedCount = cells.filter(
            cell => cell.state === "compared"
        ).length;

        compared.push({
            id: row.id,
            question: anchor,
            cells,
            comparedCount,
            missingCount: cells.length - comparedCount
        });
    }

    return {
        waves: waves.map(toHeader),
        rows: compared
    };
}
