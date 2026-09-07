import type { QuestionId } from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { SurveyElement } from "@/domain/question";
import type { FunnelTotals, QuestionFunnelRow } from "@/lib/db/funnel";
import { rampStep } from "@/lib/results/ramp";
import type { RampStep } from "@/lib/results/ramp";

/**
 * The drop-off funnel: views → starts → per-question reach → submits.
 *
 * Pure, so the shape of the report is testable without a database and without
 * a browser. The database supplies counts keyed by question id; the *order and
 * existence* of the questions come from the document, because `surveys.elements`
 * is the source of truth and `survey_questions` is an index (DECISIONS 002).
 * That also settles two cases the raw counts cannot: a question added since
 * the last visit has no row and is a genuine zero, and a question removed since
 * still has rows that must not appear in the report at all.
 */

/**
 * Percentage points lost at one stage before it is flagged.
 *
 * A funnel always slopes down; the report is only useful if it says which step
 * is steeper than the rest. Ten points is roughly "one respondent in ten left
 * here", which on a survey of any size is worth a look.
 */
export const FUNNEL_PROBLEM_DROP_PP = 10;

export type FunnelStageKind = "view" | "start" | "question" | "submit";

export type FunnelStage = {
    /** Stable across renders; the react key and the anchor for a jump link. */
    readonly id: string;
    readonly kind: FunnelStageKind;
    /** Set on question stages only — what the "fix this" button jumps to. */
    readonly questionId: QuestionId | null;
    /**
     * The question's title. Null on the three survey-level stages, whose
     * wording is in the message catalogue like every other string.
     */
    readonly title: string | null;
    readonly count: number;
    /** Share of the first stage, 0–100, one decimal. */
    readonly share: number;
    /** Points of that share lost since the previous stage. Null on the first. */
    readonly dropPp: number | null;
    /** Sessions lost since the previous stage. Null on the first. */
    readonly lost: number | null;
    /** DESIGN §7: position in the sequence. Never health. */
    readonly rampStep: RampStep;
    /** Flagged in the row chrome, never by recolouring. */
    readonly isProblem: boolean;
    /** Question stages only, and only where a dwell time was reported. */
    readonly medianDwellMs: number | null;
    /**
     * Reached the question but left it unanswered. A skip on an optional
     * question, not a drop-out — the two look identical in the count and are
     * very different to the owner.
     */
    readonly skipped: number | null;
};

export type Funnel = {
    readonly stages: readonly FunnelStage[];
    /** True when no event has ever been recorded for this survey. */
    readonly isEmpty: boolean;
    /** The steepest flagged stage, for the callout. Null when none is. */
    readonly worstStage: FunnelStage | null;
};

export function buildFunnel(
    elements: readonly SurveyElement[],
    totals: FunnelTotals,
    questionRows: ReadonlyMap<QuestionId, QuestionFunnelRow>
): Funnel {
    // Statements are not stages: nothing is answered on one, and the runner
    // does not report reach for them. They simply leave gaps, as they do in the
    // projection (DECISIONS 008).
    const questions = elements.filter(isAnswerableElement);

    type Draft = Omit<
        FunnelStage,
        "share" | "dropPp" | "lost" | "rampStep" | "isProblem"
    >;

    const drafts: Draft[] = [
        {
            id: "view",
            kind: "view",
            questionId: null,
            title: null,
            count: totals.views,
            medianDwellMs: null,
            skipped: null
        },
        {
            id: "start",
            kind: "start",
            questionId: null,
            title: null,
            count: totals.starts,
            medianDwellMs: null,
            skipped: null
        },
        ...questions.map((question): Draft => {
            const row = questionRows.get(question.id);
            return {
                id: question.id,
                kind: "question",
                questionId: question.id,
                title: question.title,
                count: row?.reached ?? 0,
                medianDwellMs: row?.medianDwellMs ?? null,
                skipped: row === undefined ? null : row.reached - row.answered
            };
        }),
        {
            id: "submit",
            kind: "submit",
            questionId: null,
            title: null,
            count: totals.submits,
            medianDwellMs: null,
            skipped: null
        }
    ];

    // Everything is measured against the top of the funnel. A survey with no
    // views has no denominator, and every share is zero rather than NaN.
    const top = drafts[0]?.count ?? 0;

    const stages = drafts.map((draft, index): FunnelStage => {
        const share = percentage(draft.count, top);
        const previous = drafts[index - 1];
        const dropPp =
            previous === undefined
                ? null
                : round(percentage(previous.count, top) - share, 1);

        return {
            ...draft,
            share,
            dropPp,
            lost: previous === undefined ? null : previous.count - draft.count,
            rampStep: rampStep(index, drafts.length),
            // A stage cannot be a problem if nobody reached the one before it:
            // "100% of nought dropped out" is arithmetic, not a finding.
            isProblem:
                dropPp !== null &&
                dropPp >= FUNNEL_PROBLEM_DROP_PP &&
                (previous?.count ?? 0) > 0
        };
    });

    // The callout names one stage, not a list. An owner shown five problems
    // fixes none of them.
    const worstStage = stages.reduce<FunnelStage | null>((worst, stage) => {
        if (!stage.isProblem) return worst;
        if (worst === null) return stage;
        return (stage.dropPp ?? 0) > (worst.dropPp ?? 0) ? stage : worst;
    }, null);

    return {
        stages,
        isEmpty:
            totals.views === 0 &&
            totals.starts === 0 &&
            totals.submits === 0 &&
            totals.abandons === 0 &&
            questionRows.size === 0,
        worstStage
    };
}

/**
 * How many of those who began actually finished, 0–100.
 *
 * Deliberately submits over *starts*, not over views: someone who opened the
 * link and left without touching a control never entered the survey, and
 * counting them makes the figure a measure of the link's audience rather than
 * of the questionnaire. Null when nobody started — an unknown rate is not 0%,
 * and a card showing 0% for a survey nobody has opened is a lie.
 */
export function completionRate(totals: FunnelTotals): number | null {
    if (totals.starts === 0) return null;
    return percentage(totals.submits, totals.starts);
}

/** Of everyone who opened the link, how many submitted. Null with no views. */
export function viewToSubmitRate(totals: FunnelTotals): number | null {
    if (totals.views === 0) return null;
    return percentage(totals.submits, totals.views);
}

function percentage(part: number, whole: number): number {
    return whole === 0 ? 0 : round((part / whole) * 100, 1);
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
