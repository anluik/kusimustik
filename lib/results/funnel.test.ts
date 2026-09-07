import { describe, expect, it } from "vitest";

import type { QuestionId } from "@/domain/ids";
import type { FunnelTotals, QuestionFunnelRow } from "@/lib/db/funnel";
import {
    FUNNEL_PROBLEM_DROP_PP,
    buildFunnel,
    completionRate,
    viewToSubmitRate
} from "@/lib/results/funnel";
import { RAMP_STEPS } from "@/lib/results/ramp";
import {
    ALL_ELEMENTS,
    Q,
    matrixSingle,
    singleChoice,
    statement
} from "@/domain/test-fixtures";

const NO_TOTALS: FunnelTotals = {
    views: 0,
    starts: 0,
    submits: 0,
    abandons: 0
};

const TOTALS: FunnelTotals = {
    views: 100,
    starts: 80,
    submits: 50,
    abandons: 30
};

function rows(
    entries: readonly (readonly [QuestionId, number, number, number | null])[]
): Map<QuestionId, QuestionFunnelRow> {
    return new Map(
        entries.map(([questionId, reached, answered, medianDwellMs]) => [
            questionId,
            { questionId, reached, answered, medianDwellMs }
        ])
    );
}

describe("buildFunnel", () => {
    it("runs view → start → one stage per question → submit", () => {
        const funnel = buildFunnel(ALL_ELEMENTS, TOTALS, rows([]));

        expect(funnel.stages.map(s => s.kind)).toEqual([
            "view",
            "start",
            ...Array<string>(8).fill("question"),
            "submit"
        ]);
        expect(funnel.stages[0]?.count).toBe(100);
        expect(funnel.stages.at(-1)?.count).toBe(50);
    });

    it("gives a statement block no stage", () => {
        const funnel = buildFunnel(ALL_ELEMENTS, TOTALS, rows([]));
        const titles = funnel.stages.map(s => s.title);
        expect(titles).not.toContain(statement.title);
        expect(funnel.stages.filter(s => s.kind === "question")).toHaveLength(
            8
        );
    });

    it("takes order and existence from the document, not the counts", () => {
        // A question the runner has rows for but the document no longer holds
        // must not appear; one the document holds but the runner has never seen
        // is a genuine zero.
        const stray = "99999999-9999-4999-8999-999999999999" as QuestionId;
        const funnel = buildFunnel(
            [statement, singleChoice, matrixSingle],
            TOTALS,
            rows([
                [stray, 70, 70, 1_000],
                [matrixSingle.id, 40, 38, 9_000]
            ])
        );

        const questions = funnel.stages.filter(s => s.kind === "question");
        expect(questions.map(s => s.questionId)).toEqual([
            singleChoice.id,
            matrixSingle.id
        ]);
        expect(questions[0]?.count).toBe(0);
        expect(questions[1]?.count).toBe(40);
    });

    it("measures every share against the top of the funnel", () => {
        const funnel = buildFunnel([singleChoice], TOTALS, rows([]));
        expect(funnel.stages.map(s => s.share)).toEqual([100, 80, 0, 50]);
    });

    it("reports the drop as points of the top-of-funnel share", () => {
        const funnel = buildFunnel(
            [singleChoice],
            TOTALS,
            rows([[singleChoice.id, 70, 70, null]])
        );
        expect(funnel.stages.map(s => s.dropPp)).toEqual([null, 20, 10, 20]);
        expect(funnel.stages.map(s => s.lost)).toEqual([null, 20, 10, 20]);
    });

    it("separates a skip from a drop-out", () => {
        const funnel = buildFunnel(
            [singleChoice],
            TOTALS,
            rows([[singleChoice.id, 70, 55, null]])
        );
        const question = funnel.stages[2];
        expect(question?.count).toBe(70);
        expect(question?.skipped).toBe(15);
    });

    it("leaves `skipped` null for a question with no rows at all", () => {
        // Nobody reached it, which is not the same as everybody skipping it.
        const funnel = buildFunnel([singleChoice], TOTALS, rows([]));
        expect(funnel.stages[2]?.skipped).toBeNull();
    });

    describe("problem flagging", () => {
        it("flags a stage at or past the drop threshold", () => {
            const funnel = buildFunnel(
                [singleChoice],
                { views: 100, starts: 100, submits: 100, abandons: 0 },
                rows([
                    [singleChoice.id, 100 - FUNNEL_PROBLEM_DROP_PP, 90, null]
                ])
            );
            expect(funnel.stages[2]?.isProblem).toBe(true);
        });

        it("leaves a shallower drop alone", () => {
            const funnel = buildFunnel(
                [singleChoice],
                { views: 100, starts: 100, submits: 100, abandons: 0 },
                rows([
                    [
                        singleChoice.id,
                        100 - FUNNEL_PROBLEM_DROP_PP + 1,
                        90,
                        null
                    ]
                ])
            );
            expect(funnel.stages[2]?.isProblem).toBe(false);
        });

        it("never flags a stage whose predecessor nobody reached", () => {
            // "100% of nought dropped out" is arithmetic, not a finding.
            const funnel = buildFunnel(ALL_ELEMENTS, NO_TOTALS, rows([]));
            expect(funnel.stages.every(s => !s.isProblem)).toBe(true);
            expect(funnel.worstStage).toBeNull();
        });

        it("names one worst stage rather than a list", () => {
            const funnel = buildFunnel(
                [singleChoice, matrixSingle],
                { views: 100, starts: 90, submits: 20, abandons: 70 },
                rows([
                    [singleChoice.id, 60, 60, null],
                    [matrixSingle.id, 50, 50, null]
                ])
            );

            const flagged = funnel.stages.filter(s => s.isProblem);
            expect(flagged.length).toBeGreaterThan(1);
            expect(funnel.worstStage).not.toBeNull();
            for (const stage of flagged) {
                expect(funnel.worstStage?.dropPp ?? 0).toBeGreaterThanOrEqual(
                    stage.dropPp ?? 0
                );
            }
        });
    });

    describe("the ramp", () => {
        it("bins the stages monotonically front to back", () => {
            const funnel = buildFunnel(ALL_ELEMENTS, TOTALS, rows([]));
            let previous = 0;
            for (const stage of funnel.stages) {
                expect(stage.rampStep).toBeGreaterThanOrEqual(previous);
                expect(stage.rampStep).toBeLessThanOrEqual(RAMP_STEPS);
                previous = stage.rampStep;
            }
        });

        it("does not recolour a flagged stage", () => {
            // §7: the ramp encodes position, never health. Two funnels with the
            // same shape and different numbers must colour identically.
            const healthy = buildFunnel(
                [singleChoice, matrixSingle],
                { views: 100, starts: 99, submits: 98, abandons: 1 },
                rows([
                    [singleChoice.id, 99, 99, null],
                    [matrixSingle.id, 99, 99, null]
                ])
            );
            const dire = buildFunnel(
                [singleChoice, matrixSingle],
                { views: 100, starts: 20, submits: 2, abandons: 18 },
                rows([
                    [singleChoice.id, 10, 5, null],
                    [matrixSingle.id, 4, 2, null]
                ])
            );
            expect(dire.stages.map(s => s.rampStep)).toEqual(
                healthy.stages.map(s => s.rampStep)
            );
            expect(dire.stages.some(s => s.isProblem)).toBe(true);
        });
    });

    describe("the empty state", () => {
        it("is empty only when nothing was ever recorded", () => {
            expect(buildFunnel(ALL_ELEMENTS, NO_TOTALS, rows([])).isEmpty).toBe(
                true
            );
        });

        it("is not empty when a question has rows but the totals do not", () => {
            const funnel = buildFunnel(
                ALL_ELEMENTS,
                NO_TOTALS,
                rows([[Q.role, 3, 3, 900]])
            );
            expect(funnel.isEmpty).toBe(false);
        });

        it("still produces every stage, at zero", () => {
            const funnel = buildFunnel(ALL_ELEMENTS, NO_TOTALS, rows([]));
            expect(funnel.stages).toHaveLength(11);
            expect(funnel.stages.every(s => s.count === 0)).toBe(true);
            expect(funnel.stages.every(s => s.share === 0)).toBe(true);
        });
    });

    it("carries the median dwell through on question stages only", () => {
        const funnel = buildFunnel(
            [singleChoice],
            TOTALS,
            rows([[singleChoice.id, 70, 70, 4_200]])
        );
        expect(funnel.stages[2]?.medianDwellMs).toBe(4_200);
        expect(funnel.stages[0]?.medianDwellMs).toBeNull();
        expect(funnel.stages[1]?.medianDwellMs).toBeNull();
        expect(funnel.stages[3]?.medianDwellMs).toBeNull();
    });
});

describe("completionRate", () => {
    it("is submits over starts, not over views", () => {
        expect(completionRate(TOTALS)).toBe(62.5);
    });

    it("is null rather than zero when nobody started", () => {
        // An unknown rate is not 0%: a card reading "0% completed" for a survey
        // nobody has opened states a failure that has not happened.
        expect(completionRate(NO_TOTALS)).toBeNull();
        expect(
            completionRate({ views: 9, starts: 0, submits: 0, abandons: 0 })
        ).toBeNull();
    });

    it("reaches 100 when everyone who started finished", () => {
        expect(
            completionRate({ views: 80, starts: 40, submits: 40, abandons: 0 })
        ).toBe(100);
    });
});

describe("viewToSubmitRate", () => {
    it("is submits over views", () => {
        expect(viewToSubmitRate(TOTALS)).toBe(50);
    });

    it("is null with no views", () => {
        expect(viewToSubmitRate(NO_TOTALS)).toBeNull();
    });
});
