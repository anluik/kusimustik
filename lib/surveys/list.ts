import type { SurveyStatus } from "@/domain/survey";
import type { SurveyStats, SurveySummary } from "@/lib/db/surveys";

/**
 * The shape of the survey list.
 *
 * Waves of one recurring survey share a `waveGroupId` (docs/DECISIONS.md 003)
 * and duplication is what creates one, so an ungrouped list would show two
 * identically titled rows the moment an owner presses duplicate. Grouping is
 * therefore part of the list, not a later comparison feature.
 *
 * Everything here is pure and synchronous: the page fetches, this arranges, and
 * the search box re-arranges without another round trip.
 */

/** A summary with the counts the list shows beside it. */
export type SurveyListItem = SurveySummary & {
    readonly responseCount: number;
    readonly questionCount: number;
};

/** A survey that is the only one in its wave group. */
export type StandaloneRow = SurveyListItem & { readonly kind: "survey" };

/** Two or more waves of the same recurring survey, newest first. */
export type WaveGroupRow = {
    readonly kind: "waveGroup";
    readonly waveGroupId: string;
    /** The newest wave's title — the wording the owner last chose. */
    readonly title: string;
    readonly waves: readonly SurveyListItem[];
    readonly waveCount: number;
    /** The newest wave's, describing the questionnaire as it stands today. */
    readonly questionCount: number;
    /** Summed across the waves: the series' total reach. */
    readonly responseCount: number;
    /** How many waves are currently accepting responses. */
    readonly openCount: number;
    readonly updatedAt: string;
};

export type SurveyListRow = StandaloneRow | WaveGroupRow;

export const STATUS_FILTERS = [
    "all",
    "draft",
    "published",
    "closed"
] as const satisfies readonly (SurveyStatus | "all")[];
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type SurveyListFilter = {
    readonly query: string;
    readonly status: StatusFilter;
};

/** Newest first, by whichever timestamp string sorts later. */
function byUpdatedAtDesc(
    a: { readonly updatedAt: string },
    b: { readonly updatedAt: string }
): number {
    return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Joins the summaries to their counts. A survey with no `survey_stats` row
 * cannot happen — the view is built from `surveys` — but a missing entry
 * reads as zero rather than failing the whole page.
 */
export function toListItems(
    summaries: readonly SurveySummary[],
    stats: ReadonlyMap<string, SurveyStats>
): SurveyListItem[] {
    return summaries.map(summary => ({
        ...summary,
        responseCount: stats.get(summary.id)?.responseCount ?? 0,
        questionCount: stats.get(summary.id)?.questionCount ?? 0
    }));
}

function toGroupRow(
    waveGroupId: string,
    waves: readonly SurveyListItem[]
): WaveGroupRow {
    const ordered = [...waves].sort(byUpdatedAtDesc);
    const newest = ordered[0];
    if (newest === undefined) {
        throw new Error(`wave group ${waveGroupId} has no waves`);
    }

    return {
        kind: "waveGroup",
        waveGroupId,
        title: newest.title,
        waves: ordered,
        waveCount: ordered.length,
        questionCount: newest.questionCount,
        responseCount: ordered.reduce(
            (total, wave) => total + wave.responseCount,
            0
        ),
        openCount: ordered.filter(wave => wave.status === "published").length,
        updatedAt: newest.updatedAt
    };
}

/**
 * Groups the list by wave group and orders it by most recent activity — a
 * group sorts by its newest wave, so answering last year's wave does not drag
 * a series back up the list.
 */
export function buildSurveyListRows(
    items: readonly SurveyListItem[]
): SurveyListRow[] {
    const groups = new Map<string, SurveyListItem[]>();
    for (const item of items) {
        const existing = groups.get(item.waveGroupId);
        if (existing === undefined) {
            groups.set(item.waveGroupId, [item]);
        } else {
            existing.push(item);
        }
    }

    const rows: SurveyListRow[] = [];
    for (const [waveGroupId, waves] of groups) {
        const only = waves.length === 1 ? waves[0] : undefined;
        rows.push(
            only === undefined
                ? toGroupRow(waveGroupId, waves)
                : { ...only, kind: "survey" }
        );
    }

    return rows.sort(byUpdatedAtDesc);
}

/**
 * Case- and accent-insensitive, so `tooandja` finds `Tööandja`. Estonian
 * keyboards are not always what people are typing on.
 */
function fold(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

function matches(item: SurveyListItem, filter: SurveyListFilter): boolean {
    if (filter.status !== "all" && item.status !== filter.status) return false;

    const query = fold(filter.query.trim());
    if (query === "") return true;

    // The slug is in there because it is what an owner has in front of them
    // when they arrive from a link and want to find the survey behind it.
    return [item.title, item.waveLabel, item.slug].some(
        field => field !== null && fold(field).includes(query)
    );
}

/**
 * Narrows the list without changing its shape: a group whose waves partly
 * match stays a group showing the matching waves, rather than being demoted to
 * a standalone survey. Its counts are recomputed from what is visible, so the
 * row never claims responses it is not showing.
 */
export function filterSurveyListRows(
    rows: readonly SurveyListRow[],
    filter: SurveyListFilter
): SurveyListRow[] {
    const result: SurveyListRow[] = [];

    for (const row of rows) {
        if (row.kind === "survey") {
            if (matches(row, filter)) result.push(row);
            continue;
        }

        const waves = row.waves.filter(wave => matches(wave, filter));
        if (waves.length === row.waves.length) result.push(row);
        else if (waves.length > 0)
            result.push(toGroupRow(row.waveGroupId, waves));
    }

    return result;
}

/** How many surveys a set of rows stands for, waves counted individually. */
export function countSurveys(rows: readonly SurveyListRow[]): number {
    return rows.reduce(
        (total, row) => total + (row.kind === "survey" ? 1 : row.waveCount),
        0
    );
}

/** How many of the rows are wave series, for the app bar's second count. */
export function countWaveGroups(rows: readonly SurveyListRow[]): number {
    return rows.filter(row => row.kind === "waveGroup").length;
}
