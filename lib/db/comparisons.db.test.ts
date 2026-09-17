import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ComparisonDocument, ComparisonRow } from "@/domain/comparison";
import { localizedText } from "@/domain/content";
import type { QuestionId, SurveyId, WaveGroupId } from "@/domain/ids";
import {
    comparisonId,
    newComparisonRowId,
    newQuestionId,
    waveGroupId
} from "@/domain/ids";
import type { SurveyElement } from "@/domain/question";
import {
    createComparison,
    deleteComparison,
    getComparison,
    listComparisonCounts,
    listComparisons,
    saveComparison
} from "@/lib/db/comparisons";
import { DbConflictError, DbNotFoundError } from "@/lib/db/errors";
import { submitResponse } from "@/lib/db/responses";
import {
    createSurvey,
    deleteSurvey,
    publishSurvey,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    shortTextQuestion,
    signIn,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { listRemovedQuestions } from "@/lib/db/waves";

/**
 * Saved comparisons against the database: who may see them, what the schema
 * refuses, and — the rule the tables are built around — that a comparison
 * never stands in the way of editing or deleting a survey
 * (docs/DECISIONS.md 035).
 */

const SEEDED_COMPARISON = comparisonId("00000000-0000-4000-8000-0000000000c1");

let owner: TestUser;
let stranger: TestUser;

beforeAll(async () => {
    owner = await createTestUser("comparisons");
    stranger = await createTestUser("comparisons-stranger");
});

afterAll(async () => {
    await deleteTestUser(owner);
    await deleteTestUser(stranger);
});

/** A copy of the document with fresh ids and the same keys: the next wave. */
function nextWave(elements: readonly SurveyElement[]): SurveyElement[] {
    return elements.map(element => ({ ...element, id: newQuestionId() }));
}

async function wave(
    elements: readonly SurveyElement[],
    group?: WaveGroupId
): Promise<SurveyRecord> {
    return createSurvey(owner.db, {
        ownerId: owner.id,
        title: localizedText("et", "Comparison wave"),
        elements: stored(elements),
        ...(group !== undefined && { waveGroupId: group })
    });
}

type Group = {
    readonly group: WaveGroupId;
    readonly waves: readonly SurveyRecord[];
    readonly elements: readonly (readonly SurveyElement[])[];
};

async function group(
    count: number,
    first: readonly SurveyElement[] = [
        npsQuestion("nps"),
        shortTextQuestion("comment")
    ]
): Promise<Group> {
    const elements = [first];
    const head = await wave(first);
    const id = waveGroupId(head.survey.waveGroupId);
    const waves = [head];
    for (let n = 1; n < count; n += 1) {
        const next = nextWave(first);
        elements.push(next);
        waves.push(await wave(next, id));
    }
    return { group: id, waves, elements };
}

function questionAt(g: Group, wave: number, index: number): QuestionId {
    const element = g.elements[wave]?.[index];
    if (element === undefined) throw new Error("no such question");
    return element.id;
}

function row(matches: readonly [SurveyId, QuestionId][]): ComparisonRow {
    return {
        id: newComparisonRowId(),
        matches: matches.map(([surveyId, questionId]) => ({
            surveyId,
            questionId
        }))
    };
}

function document(
    g: Group,
    rows: readonly ComparisonRow[]
): ComparisonDocument {
    return {
        name: "Test comparison",
        surveyIds: g.waves.map(w => w.survey.id),
        rows: [...rows]
    };
}

/** Row matching question `index` across every wave of the group. */
function across(g: Group, index: number): ComparisonRow {
    return row(
        g.waves.map((w, n) => [w.survey.id, questionAt(g, n, index)] as const)
    );
}

describe("the seeded comparison", () => {
    it("reads back whole, waves oldest first", async () => {
        const db = await signIn("owner@kusimustik.test", "password123");
        const record = await getComparison(db, SEEDED_COMPARISON);
        if (record === null) throw new Error("seeded comparison missing");

        expect(record.document.name).toBe("2025 – 2026");
        expect(record.document.surveyIds).toEqual([
            "00000000-0000-4000-8000-0000000000a1",
            "00000000-0000-4000-8000-0000000000a2"
        ]);
        expect(record.document.rows).toHaveLength(8);
        for (const r of record.document.rows) {
            expect(r.matches.map(m => m.surveyId)).toEqual(
                record.document.surveyIds
            );
        }

        const [summary] = await listComparisons(db, record.waveGroupId);
        expect(summary).toMatchObject({
            id: SEEDED_COMPARISON,
            name: "2025 – 2026"
        });
    });
});

describe("access", () => {
    it("is the owner's alone", async () => {
        const g = await group(2);
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });

        expect(await getComparison(stranger.db, id)).toBeNull();
        expect(await listComparisons(stranger.db, g.group)).toEqual([]);
        await expect(
            saveComparison(stranger.db, id, 1, document(g, []))
        ).rejects.toBeInstanceOf(DbNotFoundError);
        await expect(deleteComparison(stranger.db, id)).rejects.toBeInstanceOf(
            DbNotFoundError
        );

        // Still intact for its owner.
        expect((await getComparison(owner.db, id))?.document.rows).toHaveLength(
            1
        );
    });

    it("cannot be built over someone else's surveys", async () => {
        const g = await group(2);
        await expect(
            createComparison(stranger.db, {
                waveGroupId: g.group,
                document: document(g, [across(g, 0)])
            })
        ).resolves.toBeDefined();
        // The stranger's comparison exists, but RLS hid the surveys from the
        // RPC, so it covers nothing and matches nothing.
        const [mine] = await listComparisons(stranger.db, g.group);
        if (mine === undefined) throw new Error("no comparison");
        expect(mine.surveyIds).toEqual([]);
        expect(
            (await getComparison(stranger.db, mine.id))?.document.rows
        ).toEqual([]);
    });
});

describe("saving", () => {
    it("round-trips and bumps the version", async () => {
        const g = await group(2);
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });
        const created = await getComparison(owner.db, id);
        expect(created?.version).toBe(1);

        const next = {
            ...document(g, [across(g, 0), across(g, 1)]),
            name: "Renamed"
        };
        expect(await saveComparison(owner.db, id, 1, next)).toBe(2);

        const saved = await getComparison(owner.db, id);
        expect(saved?.document.name).toBe("Renamed");
        expect(saved?.document.rows).toHaveLength(2);
    });

    it("refuses a stale version", async () => {
        const g = await group(2);
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [])
        });
        await saveComparison(owner.db, id, 1, document(g, []));
        await expect(
            saveComparison(owner.db, id, 1, document(g, []))
        ).rejects.toBeInstanceOf(DbConflictError);
    });

    it("refuses a wave from another group", async () => {
        const g = await group(2);
        const other = await wave([npsQuestion("nps")]);
        await expect(
            createComparison(owner.db, {
                waveGroupId: g.group,
                document: {
                    name: "Mixed",
                    surveyIds: [g.waves[0]?.survey.id, other.survey.id].filter(
                        (s): s is SurveyId => s !== undefined
                    ),
                    rows: []
                }
            })
        ).rejects.toThrow(/not a wave of this comparison's group/);
    });

    it("refuses a sixth wave, even past the schema", async () => {
        const g = await group(6);
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: {
                ...document(g, []),
                surveyIds: g.waves.slice(0, 5).map(w => w.survey.id)
            }
        });
        const sixth = g.waves[5]?.survey.id;
        if (sixth === undefined) throw new Error();
        const { error } = await owner.db
            .from("wave_comparison_waves")
            .insert({ comparison_id: id, survey_id: sixth });
        expect(error?.code).toBe("23514");
        expect(error?.message).toMatch(/at most five waves/);
    });

    it("refuses two question types in one row", async () => {
        const g = await group(2);
        const [first, second] = g.waves;
        if (first === undefined || second === undefined) throw new Error();
        await expect(
            createComparison(owner.db, {
                waveGroupId: g.group,
                document: document(g, [
                    row([
                        [first.survey.id, questionAt(g, 0, 0)],
                        [second.survey.id, questionAt(g, 1, 1)]
                    ])
                ])
            })
        ).rejects.toThrow(/only match questions of one type/);
    });

    it("drops a match whose question vanished rather than failing the save", async () => {
        // The editor holds a document that was valid when it loaded. A question
        // deleted in another tab must not wedge every retry of that document.
        const g = await group(2);
        const [first, second] = g.waves;
        if (first === undefined || second === undefined) throw new Error();
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [])
        });

        await updateSurveyDefinition(
            owner.db,
            second.survey.id,
            second.version,
            {
                elements: stored(
                    [g.elements[1]?.[1]].filter(
                        (e): e is SurveyElement => e !== undefined
                    )
                )
            }
        );

        await saveComparison(
            owner.db,
            id,
            1,
            document(g, [across(g, 0), across(g, 1)])
        );
        const saved = await getComparison(owner.db, id);
        expect(saved?.document.rows.map(r => r.matches.length).sort()).toEqual([
            1, 2
        ]);
    });
});

describe("a comparison never blocks the survey", () => {
    it("lets the builder change a matched question's type", async () => {
        const g = await group(2);
        const second = g.waves[1];
        if (second === undefined) throw new Error();
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });

        const retyped = g.elements[1]?.map((element, index) =>
            index === 0
                ? { ...shortTextQuestion("nps"), id: element.id }
                : element
        );
        await expect(
            updateSurveyDefinition(owner.db, second.survey.id, second.version, {
                elements: stored(retyped ?? [])
            })
        ).resolves.toBeDefined();

        // The match is still there; the read reports it as mismatched.
        expect((await getComparison(owner.db, id))?.document.rows).toHaveLength(
            1
        );
    });

    it("drops the match of an unanswered question that leaves its wave", async () => {
        const g = await group(2);
        const second = g.waves[1];
        if (second === undefined) throw new Error();
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });

        await updateSurveyDefinition(
            owner.db,
            second.survey.id,
            second.version,
            {
                elements: stored(g.elements[1]?.slice(1) ?? [])
            }
        );

        const [only] = (await getComparison(owner.db, id))?.document.rows ?? [];
        expect(only?.matches.map(m => m.surveyId)).toEqual([
            g.waves[0]?.survey.id
        ]);
    });

    it("keeps the match of an answered question, and its last definition", async () => {
        const g = await group(2);
        const second = g.waves[1];
        if (second === undefined) throw new Error();
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });

        const published = await publishSurvey(
            owner.db,
            second.survey.id,
            testSlug("cmp")
        );
        const answered = questionAt(g, 1, 0);
        await submitResponse(anonClient(), {
            surveyId: second.survey.id,
            answers: [
                { questionId: answered, value: { type: "nps", value: 9 } }
            ]
        });
        await updateSurveyDefinition(
            owner.db,
            second.survey.id,
            published.version,
            {
                elements: stored(g.elements[1]?.slice(1) ?? [])
            }
        );

        const [kept] = (await getComparison(owner.db, id))?.document.rows ?? [];
        expect(kept?.matches).toHaveLength(2);

        const removed = await listRemovedQuestions(owner.db, [
            answered,
            questionAt(g, 0, 0)
        ]);
        expect([...removed.keys()]).toEqual([answered]);
        expect(removed.get(answered)).toMatchObject({
            surveyId: second.survey.id,
            question: { type: "nps", key: "nps" }
        });
    });

    it("loses only a deleted survey's membership", async () => {
        const g = await group(3);
        const doomed = g.waves[1];
        if (doomed === undefined) throw new Error();
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });
        expect(
            (await listComparisonCounts(owner.db)).get(doomed.survey.id)
        ).toBe(1);

        await deleteSurvey(owner.db, doomed.survey.id);

        const after = await getComparison(owner.db, id);
        expect(after?.document.surveyIds).toEqual([
            g.waves[0]?.survey.id,
            g.waves[2]?.survey.id
        ]);
        expect(after?.document.rows[0]?.matches).toHaveLength(2);
    });

    it("deletes cleanly", async () => {
        const g = await group(2);
        const id = await createComparison(owner.db, {
            waveGroupId: g.group,
            document: document(g, [across(g, 0)])
        });
        await deleteComparison(owner.db, id);
        expect(await getComparison(owner.db, id)).toBeNull();
    });
});
