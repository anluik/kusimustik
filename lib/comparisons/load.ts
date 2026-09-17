import type { ComparisonId, QuestionId } from "@/domain/ids";
import { getComparison } from "@/lib/db/comparisons";
import type { ComparisonRecord } from "@/lib/db/comparisons";
import type { Db } from "@/lib/db/types";
import {
    listRemovedQuestions,
    listWaveGroup,
    withResponses
} from "@/lib/db/waves";
import type { WaveDefinition } from "@/lib/db/waves";
import { buildComparison } from "@/lib/results/wave-comparison";
import type { WaveComparison } from "@/lib/results/wave-comparison";

/**
 * Everything the result screen needs for one comparison, built on the server.
 *
 * The group's waves are read whole — the page names them and offers the ones
 * not yet compared — but responses are read only for the waves the comparison
 * covers, and removed definitions only for matched questions that have left
 * their waves. Null when the comparison is not the caller's.
 */
export type ComparisonView = {
    readonly record: ComparisonRecord;
    /** Every wave of the group, oldest first, definitions only. */
    readonly group: readonly WaveDefinition[];
    readonly comparison: WaveComparison;
};

export async function loadComparisonView(
    db: Db,
    id: ComparisonId
): Promise<ComparisonView | null> {
    const record = await getComparison(db, id);
    if (record === null) return null;

    const group = await listWaveGroup(db, record.waveGroupId);
    const covered = new Set(record.document.surveyIds);
    const members = await withResponses(
        db,
        group.filter(wave => covered.has(wave.survey.id))
    );

    const live = new Set<QuestionId>(
        members.flatMap(wave => wave.survey.elements.map(element => element.id))
    );
    const removed = await listRemovedQuestions(
        db,
        record.document.rows.flatMap(row =>
            row.matches
                .map(match => match.questionId)
                .filter(questionId => !live.has(questionId))
        )
    );

    return {
        record,
        group,
        comparison: buildComparison({
            waves: members,
            rows: record.document.rows,
            removed
        })
    };
}
