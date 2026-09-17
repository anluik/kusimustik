import { z } from "zod";

import { assertNever } from "@/domain/assert-never";
import type { ComparisonRowId, QuestionId, SurveyId } from "@/domain/ids";
import {
    ComparisonRowIdSchema,
    QuestionIdSchema,
    SurveyIdSchema,
    newComparisonRowId
} from "@/domain/ids";
import { isAnswerableElement } from "@/domain/question";
import type { AnswerableQuestion, SurveyElement } from "@/domain/question";

/**
 * Wave comparisons: what the owner has said is the same question across the
 * waves of one recurring survey (docs/DECISIONS.md 035).
 *
 * A comparison is a list of **rows**. A row lines up at most one question from
 * each wave the comparison covers. Nothing here infers that two questions are
 * the same on its own: `suggestMatches` fills in starting rows when the owner
 * creates a comparison, adds a wave or asks, and the owner changes them. The rules a
 * row must satisfy are `matchVerdict`'s, and they are checked when the owner
 * picks, when the server saves, and again when the result is drawn, because a
 * question's definition can change after it was matched.
 */

/** A comparison needs two waves to compare anything. */
export const MIN_COMPARED_WAVES = 2;

/**
 * DESIGN §7 allows five categorical colours and forbids a sixth, and in a
 * comparison the wave is the category. Past five is a palette decision, not a
 * schema one.
 */
export const MAX_COMPARED_WAVES = 5;

export const COMPARISON_NAME_MAX = 120;

/** Why two questions may not share a row. */
export const MATCH_REFUSALS = ["typeMismatch", "scaleMismatch"] as const;
export type MatchRefusal = (typeof MATCH_REFUSALS)[number];

export type MatchVerdict =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: MatchRefusal };

const OK: MatchVerdict = { ok: true };
const refuse = (reason: MatchRefusal): MatchVerdict => ({ ok: false, reason });

// --- Schemas ----------------------------------------------------------------

export const ComparisonNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(COMPARISON_NAME_MAX);

export const ComparisonMatchSchema = z.object({
    surveyId: SurveyIdSchema,
    questionId: QuestionIdSchema
});
export type ComparisonMatch = z.infer<typeof ComparisonMatchSchema>;

const firstRepeat = <T>(items: Iterable<T>): T | undefined => {
    const seen = new Set<T>();
    for (const item of items) {
        if (seen.has(item)) return item;
        seen.add(item);
    }
    return undefined;
};

export const ComparisonRowSchema = z.object({
    id: ComparisonRowIdSchema,
    matches: z.array(ComparisonMatchSchema).check(ctx => {
        const repeated = firstRepeat(ctx.value.map(match => match.surveyId));
        if (repeated !== undefined) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                message: `a row holds two questions from wave ${repeated}`
            });
        }
    })
});
export type ComparisonRow = z.infer<typeof ComparisonRowSchema>;

const WaveListSchema = z
    .array(SurveyIdSchema)
    .max(MAX_COMPARED_WAVES)
    .check(ctx => {
        const repeated = firstRepeat(ctx.value);
        if (repeated !== undefined) {
            ctx.issues.push({
                code: "custom",
                input: ctx.value,
                message: `wave ${repeated} is listed twice`
            });
        }
    });

/**
 * A comparison as the editor holds it and the server saves it.
 *
 * `surveyIds` may hold fewer than two: deleting a survey takes it out of every
 * comparison rather than deleting them, so a stored comparison can be down to
 * one wave, or none, and still be the owner's to extend or delete. Creating
 * one is held to `NewComparisonSchema` instead.
 */
export const ComparisonDocumentSchema = z
    .object({
        name: ComparisonNameSchema,
        surveyIds: WaveListSchema,
        rows: z.array(ComparisonRowSchema)
    })
    .check(ctx => {
        const { surveyIds, rows } = ctx.value;
        const push = (message: string) =>
            ctx.issues.push({ code: "custom", input: ctx.value, message });

        const repeatedRow = firstRepeat(rows.map(row => row.id));
        if (repeatedRow !== undefined) {
            push(`row ${repeatedRow} is listed twice`);
        }

        const matches = rows.flatMap(row => row.matches);
        const repeatedQuestion = firstRepeat(
            matches.map(match => match.questionId)
        );
        if (repeatedQuestion !== undefined) {
            push(`question ${repeatedQuestion} is in two rows`);
        }

        const covered = new Set(surveyIds);
        const stray = matches.find(match => !covered.has(match.surveyId));
        if (stray !== undefined) {
            push(`a row matches wave ${stray.surveyId}, which is not compared`);
        }
    });
export type ComparisonDocument = z.infer<typeof ComparisonDocumentSchema>;

/** What the new-comparison dialog submits. */
export const NewComparisonSchema = z.object({
    name: ComparisonNameSchema,
    surveyIds: WaveListSchema.min(MIN_COMPARED_WAVES)
});
export type NewComparison = z.infer<typeof NewComparisonSchema>;

// --- The rules ---------------------------------------------------------------

/**
 * May these two questions share a row?
 *
 * The type must be the same — a dropdown and a single choice both pick one
 * option and are still not the same question. Beyond that, each type states
 * what else would make the two summaries incomparable. Choice questions whose
 * options differ are *allowed*: options are matched by stored value when the
 * row is drawn, and one a wave did not offer is shown as not offered.
 */
export function matchVerdict(
    a: AnswerableQuestion,
    b: AnswerableQuestion
): MatchVerdict {
    switch (a.type) {
        case "single_choice":
        case "multi_choice":
        case "dropdown":
        case "short_text":
        case "long_text":
        case "nps":
        case "matrix_single":
            return b.type === a.type ? OK : refuse("typeMismatch");
        case "opinion_scale":
            // Two scales of different lengths put "4" in different places —
            // the distribution and the mean would both lie.
            if (b.type !== "opinion_scale") return refuse("typeMismatch");
            return a.max === b.max ? OK : refuse("scaleMismatch");
        default:
            return assertNever(a, "question type");
    }
}

/** Every question in a row, held to the first. */
export function rowVerdict(
    questions: readonly AnswerableQuestion[]
): MatchVerdict {
    const [first, ...rest] = questions;
    if (first === undefined) return OK;
    for (const question of rest) {
        const verdict = matchVerdict(first, question);
        if (!verdict.ok) return verdict;
    }
    return OK;
}

// --- Reading a row against the waves ----------------------------------------

/**
 * One wave as the comparison sees it: its own definition, resolved in its own
 * language. Waves are always passed oldest first.
 */
export type ComparisonWave = {
    readonly surveyId: SurveyId;
    readonly elements: readonly SurveyElement[];
};

type Located = {
    readonly surveyId: SurveyId;
    readonly question: AnswerableQuestion;
};

function questionIndex(
    waves: readonly ComparisonWave[]
): ReadonlyMap<QuestionId, Located> {
    const index = new Map<QuestionId, Located>();
    for (const wave of waves) {
        for (const element of wave.elements) {
            if (isAnswerableElement(element)) {
                index.set(element.id, {
                    surveyId: wave.surveyId,
                    question: element
                });
            }
        }
    }
    return index;
}

/**
 * The row's questions that the waves still define, in the row's own order.
 * A question removed from its wave, or matched in a wave that is no longer
 * passed in, is simply not here.
 */
export function rowQuestions(
    waves: readonly ComparisonWave[],
    row: ComparisonRow
): readonly Located[] {
    const index = questionIndex(waves);
    return row.matches.flatMap(match => {
        const located = index.get(match.questionId);
        return located !== undefined && located.surveyId === match.surveyId
            ? [located]
            : [];
    });
}

/**
 * May this question be chosen for this row, in this wave?
 *
 * The row's current choice in the same wave is not judged: choosing replaces
 * it. A candidate the waves do not define is a caller bug — the editor only
 * offers questions it read from these same waves.
 */
export function candidateVerdict(
    waves: readonly ComparisonWave[],
    row: ComparisonRow,
    surveyId: SurveyId,
    questionId: QuestionId
): MatchVerdict {
    const candidate = questionIndex(waves).get(questionId);
    if (candidate === undefined || candidate.surveyId !== surveyId) {
        throw new Error(`question ${questionId} is not in wave ${surveyId}`);
    }
    const others = rowQuestions(waves, row)
        .filter(located => located.surveyId !== surveyId)
        .map(located => located.question);
    return rowVerdict([...others, candidate.question]);
}

/**
 * Wording as the wording suggestion compares it: case, spacing and
 * punctuation do not count, letters do — "töö" and "too" are different words.
 */
export function normalizeWording(text: string): string {
    return text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

// --- Suggestions -------------------------------------------------------------

export type SuggestionScope =
    /** Creating a comparison, or the owner asking: every unmatched question. */
    | { readonly kind: "all" }
    /** A wave was just added: fill its column in the rows that exist. */
    | { readonly kind: "wave"; readonly surveyId: SurveyId };

type WaveLookup = {
    readonly surveyId: SurveyId;
    readonly byKey: ReadonlyMap<string, AnswerableQuestion>;
    readonly byWording: ReadonlyMap<string, readonly AnswerableQuestion[]>;
};

function lookup(wave: ComparisonWave): WaveLookup {
    const byKey = new Map<string, AnswerableQuestion>();
    const byWording = new Map<string, AnswerableQuestion[]>();
    for (const element of wave.elements) {
        if (!isAnswerableElement(element)) continue;
        byKey.set(element.key, element);
        const words = normalizeWording(element.title);
        if (words === "") continue;
        byWording.set(words, [...(byWording.get(words) ?? []), element]);
    }
    return { surveyId: wave.surveyId, byKey, byWording };
}

/**
 * Proposes matches, and returns the whole row list with them in.
 *
 * - A question already in a row is never moved or re-used. That is what makes
 *   removing a match stick: the owner removed it, so it is in no row, and the
 *   only runs that could bring it back are the ones the owner starts.
 * - Existing rows are only ever *added to*, one wave at a time.
 * - Lineage (the same key, which duplicating a survey preserves) is tried
 *   before wording (the same normalised text, which catches a question deleted
 *   and re-added).
 * - Wording only counts when it is unique in *both* waves: two questions both
 *   called "Comments" are a guess, and a guess is not a suggestion.
 * - New rows (scope `all` only) are anchored on the newest wave, and a row of
 *   one question is not a suggestion at all.
 *
 * Deterministic for a given input and `newRowId`.
 */
export function suggestMatches({
    waves,
    rows,
    scope,
    newRowId = newComparisonRowId
}: {
    readonly waves: readonly ComparisonWave[];
    readonly rows: readonly ComparisonRow[];
    readonly scope: SuggestionScope;
    readonly newRowId?: () => ComparisonRowId;
}): ComparisonRow[] {
    const lookups = new Map(waves.map(wave => [wave.surveyId, lookup(wave)]));
    const newestFirst = [...waves].reverse();
    const used = new Set(
        rows.flatMap(row => row.matches.map(match => match.questionId))
    );

    const find = (
        members: readonly Located[],
        target: WaveLookup
    ): AnswerableQuestion | undefined => {
        const current = members.map(member => member.question);
        const fits = (candidate: AnswerableQuestion) =>
            !used.has(candidate.id) && rowVerdict([...current, candidate]).ok;

        for (const { question } of members) {
            const candidate = target.byKey.get(question.key);
            if (candidate !== undefined && fits(candidate)) {
                return candidate;
            }
        }

        for (const { surveyId, question } of members) {
            const words = normalizeWording(question.title);
            if (words === "") continue;
            const own = lookups.get(surveyId)?.byWording.get(words) ?? [];
            const candidates = target.byWording.get(words) ?? [];
            const [candidate] = candidates;
            if (
                own.length === 1 &&
                candidates.length === 1 &&
                candidate !== undefined &&
                fits(candidate)
            ) {
                return candidate;
            }
        }
        return undefined;
    };

    const targets = newestFirst.filter(
        wave => scope.kind === "all" || wave.surveyId === scope.surveyId
    );

    const extended = rows.map(row => {
        const members = [...rowQuestions(waves, row)];
        if (members.length === 0) return row;

        let next = row;
        for (const wave of targets) {
            if (next.matches.some(match => match.surveyId === wave.surveyId)) {
                continue;
            }
            const target = lookups.get(wave.surveyId);
            if (target === undefined) continue;

            const found = find(members, target);
            if (found === undefined) continue;

            used.add(found.id);
            members.push({ surveyId: wave.surveyId, question: found });
            next = {
                ...next,
                matches: [
                    ...next.matches,
                    { surveyId: wave.surveyId, questionId: found.id }
                ]
            };
        }
        return next;
    });

    if (scope.kind === "wave") return extended;

    const created: ComparisonRow[] = [];
    for (const anchor of newestFirst) {
        for (const element of anchor.elements) {
            if (!isAnswerableElement(element) || used.has(element.id)) {
                continue;
            }

            const members: Located[] = [
                { surveyId: anchor.surveyId, question: element }
            ];
            for (const wave of newestFirst) {
                if (wave.surveyId === anchor.surveyId) continue;
                const target = lookups.get(wave.surveyId);
                if (target === undefined) continue;

                const found = find(members, target);
                if (found === undefined) continue;

                members.push({ surveyId: wave.surveyId, question: found });
            }

            if (members.length < MIN_COMPARED_WAVES) continue;
            for (const member of members) used.add(member.question.id);
            created.push({
                id: newRowId(),
                matches: members.map(member => ({
                    surveyId: member.surveyId,
                    questionId: member.question.id
                }))
            });
        }
    }

    return [...extended, ...created];
}

// --- Housekeeping ------------------------------------------------------------

/**
 * Drops matches in waves the comparison no longer covers, then the rows that
 * leaves with nothing in them.
 */
export function pruneRows(
    rows: readonly ComparisonRow[],
    surveyIds: readonly SurveyId[]
): ComparisonRow[] {
    const covered = new Set(surveyIds);
    return rows.flatMap(row => {
        const matches = row.matches.filter(match =>
            covered.has(match.surveyId)
        );
        if (matches.length === 0) return [];
        return matches.length === row.matches.length
            ? [row]
            : [{ ...row, matches }];
    });
}

/**
 * The order rows are shown in: the newest wave's questionnaire, then the
 * questions only older waves asked, in their order. A row whose questions no
 * wave defines any more goes last. Nothing about the order is stored, so it
 * follows the owner's reordering in the builder without a save here.
 */
export function orderRows<Row extends ComparisonRow>(
    waves: readonly ComparisonWave[],
    rows: readonly Row[]
): Row[] {
    const place = new Map<QuestionId, readonly [number, number]>();
    [...waves].reverse().forEach((wave, age) => {
        wave.elements.forEach((element, position) => {
            if (isAnswerableElement(element)) {
                place.set(element.id, [age, position]);
            }
        });
    });

    const LAST = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as const;
    const earliest = (row: Row): readonly [number, number] =>
        row.matches.reduce<readonly [number, number]>((best, match) => {
            const at = place.get(match.questionId);
            if (at === undefined) return best;
            return at[0] < best[0] || (at[0] === best[0] && at[1] < best[1])
                ? at
                : best;
        }, LAST);

    return rows
        .map((row, index) => ({ row, index, at: earliest(row) }))
        .sort(
            (a, b) =>
                a.at[0] - b.at[0] || a.at[1] - b.at[1] || a.index - b.index
        )
        .map(entry => entry.row);
}
