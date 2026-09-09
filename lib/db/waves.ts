import type { WaveGroupId } from "@/domain/ids";
import { resolveSurvey } from "@/domain/localize";
import type { Survey } from "@/domain/survey";
import { listResponsesBySurvey } from "@/lib/db/responses";
import type { ResponseRecord } from "@/lib/db/responses";
import { listWaveGroupSurveys } from "@/lib/db/surveys";
import type { Db } from "@/lib/db/types";

/**
 * The read behind wave comparison: every wave of one recurring survey with its
 * definition and its responses, oldest first.
 *
 * Three round trips whatever the number of waves — the definitions, then their
 * responses and answers together (`listResponsesBySurvey`). A loop over
 * `listResponses` would have been two queries *per wave*, and a wave group is
 * the one thing in this product that is guaranteed to grow every year.
 *
 * The alignment itself is deliberately not here. Which question in wave A is
 * which question in wave B is a question about `key` (docs/DECISIONS.md 003)
 * and it is answered by `buildWaveComparison` in `lib/results/`, where it is
 * pure and testable without a database. What this function guarantees is that
 * the alignment has everything it needs: whole definitions, whole response
 * sets, and a stable chronological order.
 */

export type WaveResponses = {
    readonly survey: Survey;
    /** When the wave was created — what `listWaveGroupSurveys` orders on. */
    readonly createdAt: string;
    readonly responses: readonly ResponseRecord[];
};

export async function listWaveGroupResponses(
    db: Db,
    waveGroupId: WaveGroupId
): Promise<WaveResponses[]> {
    const records = await listWaveGroupSurveys(db, waveGroupId);
    // Either the group does not exist or it is not the caller's — the same
    // answer, deliberately, and one that costs no further round trip.
    if (records.length === 0) return [];

    const responses = await listResponsesBySurvey(
        db,
        records.map(record => record.survey.id)
    );

    return records.map(record => ({
        // Comparison is an owner-facing report in one language, and every wave
        // brings its own: each is resolved through the locale it was written
        // in, so a group whose 2027 wave was authored in English still lines up.
        survey: resolveSurvey(record.survey),
        createdAt: record.createdAt,
        responses: responses.get(record.survey.id) ?? []
    }));
}
