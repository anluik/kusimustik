import type {
    ComparisonDocument,
    ComparisonRow,
    ComparisonWave
} from "@/domain/comparison";
import { pruneRows, rowVerdict } from "@/domain/comparison";
import type { QuestionId, SurveyId } from "@/domain/ids";
import type { AnswerableQuestion } from "@/domain/question";
import { isAnswerableElement } from "@/domain/question";

/**
 * The server's second look at a comparison the editor wants to save.
 *
 * The schema has already held the document to its shape; this holds it to the
 * waves as they are *now*:
 *
 * - every wave it covers is a wave of the comparison's group;
 * - every row the save **changes** satisfies `rowVerdict` over the questions
 *   its matches resolve to. An unchanged row is not re-judged: a question can
 *   change type in the builder after it was matched, and refusing the whole
 *   document for a row the owner did not touch would stop the editor saving
 *   anything until they found it. That row is reported as mismatched when the
 *   comparison is drawn instead;
 * - a match that resolves to nothing — its question left the document since
 *   the editor loaded — is dropped, as `save_comparison` would drop it, rather
 *   than failing a save that every retry would fail again.
 *
 * Waves come back in chronological order whatever order the editor sent.
 */

export type RemovedLookup = ReadonlyMap<
    QuestionId,
    { readonly surveyId: SurveyId; readonly question: AnswerableQuestion }
>;

export type SaveCheck =
    | { readonly ok: true; readonly document: ComparisonDocument }
    | { readonly ok: false; readonly error: "invalidInput" | "refused" };

const sameMatches = (a: ComparisonRow, b: ComparisonRow): boolean =>
    a.matches.length === b.matches.length &&
    a.matches.every(match =>
        b.matches.some(
            other =>
                other.surveyId === match.surveyId &&
                other.questionId === match.questionId
        )
    );

export function checkComparisonSave({
    waves,
    removed,
    stored,
    next
}: {
    /** Every wave of the comparison's group, oldest first. */
    readonly waves: readonly ComparisonWave[];
    /** Last definitions of matched questions that have been removed. */
    readonly removed: RemovedLookup;
    readonly stored: ComparisonDocument;
    readonly next: ComparisonDocument;
}): SaveCheck {
    const chronological = waves.map(wave => wave.surveyId);
    const requested = new Set(next.surveyIds);
    if (next.surveyIds.some(id => !chronological.includes(id))) {
        return { ok: false, error: "invalidInput" };
    }
    const surveyIds = chronological.filter(id => requested.has(id));

    const live = new Map<QuestionId, AnswerableQuestion>();
    const waveOf = new Map<QuestionId, SurveyId>();
    for (const wave of waves) {
        for (const element of wave.elements) {
            if (!isAnswerableElement(element)) continue;
            live.set(element.id, element);
            waveOf.set(element.id, wave.surveyId);
        }
    }
    const resolve = (
        surveyId: SurveyId,
        questionId: QuestionId
    ): AnswerableQuestion | undefined => {
        if (waveOf.get(questionId) === surveyId) return live.get(questionId);
        const gone = removed.get(questionId);
        return gone?.surveyId === surveyId ? gone.question : undefined;
    };

    const before = new Map(stored.rows.map(row => [row.id, row]));
    const rows: ComparisonRow[] = [];
    for (const row of next.rows) {
        const previous = before.get(row.id);
        if (previous !== undefined && sameMatches(previous, row)) {
            rows.push(row);
            continue;
        }

        const resolved = row.matches.flatMap(match => {
            const question = resolve(match.surveyId, match.questionId);
            return question === undefined ? [] : [{ match, question }];
        });
        if (!rowVerdict(resolved.map(entry => entry.question)).ok) {
            return { ok: false, error: "refused" };
        }
        rows.push({ ...row, matches: resolved.map(entry => entry.match) });
    }

    return {
        ok: true,
        document: { ...next, surveyIds, rows: pruneRows(rows, surveyIds) }
    };
}
