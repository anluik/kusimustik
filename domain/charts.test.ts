import { describe, expect, it } from "vitest";

import {
    CHART_KINDS,
    CHART_SHORT_LABEL_MAX,
    CHART_VERTICAL_MAX_OPTIONS,
    chartKindsFor,
    defaultChartKind,
    supportsChartKind
} from "@/domain/charts";
import type { ChartKind } from "@/domain/charts";
import { questionId } from "@/domain/ids";
import type {
    AnswerableQuestion,
    MultiChoiceQuestion,
    SingleChoiceQuestion
} from "@/domain/question";
import {
    ALL_QUESTIONS,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    singleChoice
} from "@/domain/test-fixtures";

/** A single_choice with `count` options, each label `length` characters long. */
function choiceWith(count: number, length: number): SingleChoiceQuestion {
    return {
        ...singleChoice,
        allowOther: false,
        options: Array.from({ length: count }, (_, index) => ({
            value: `o${index}`,
            label: "x".repeat(length)
        }))
    };
}

describe("chartKindsFor", () => {
    it("puts the default first and never repeats a kind", () => {
        for (const question of ALL_QUESTIONS) {
            const kinds = chartKindsFor(question, "single_wave");
            expect(new Set(kinds).size).toBe(kinds.length);
            expect(kinds[0] ?? null).toBe(
                defaultChartKind(question, "single_wave")
            );
        }
    });

    it("only ever returns kinds that are in the union", () => {
        for (const question of ALL_QUESTIONS) {
            for (const shape of ["single_wave", "series"] as const) {
                for (const kind of chartKindsFor(question, shape)) {
                    expect(CHART_KINDS).toContain(kind);
                }
            }
        }
    });

    describe("categorical questions", () => {
        it("defaults single_choice to horizontal bars", () => {
            expect(chartKindsFor(singleChoice, "single_wave")[0]).toBe(
                "bar_horizontal"
            );
        });

        it("defaults multi_choice and dropdown to horizontal bars", () => {
            expect(defaultChartKind(multiChoice, "single_wave")).toBe(
                "bar_horizontal"
            );
            expect(defaultChartKind(dropdown, "single_wave")).toBe(
                "bar_horizontal"
            );
        });

        it("offers vertical bars at few options with short labels", () => {
            const question = choiceWith(
                CHART_VERTICAL_MAX_OPTIONS,
                CHART_SHORT_LABEL_MAX
            );
            expect(chartKindsFor(question, "single_wave")).toEqual([
                "bar_horizontal",
                "bar_vertical"
            ]);
        });

        it("withholds vertical bars past the option cap", () => {
            const question = choiceWith(CHART_VERTICAL_MAX_OPTIONS + 1, 4);
            expect(chartKindsFor(question, "single_wave")).toEqual([
                "bar_horizontal"
            ]);
        });

        it("withholds vertical bars when a single label is too long", () => {
            // DESIGN §7 forbids rotated labels, so a vertical chart that cannot
            // label itself horizontally has no legal way to be drawn.
            const question = choiceWith(3, CHART_SHORT_LABEL_MAX + 1);
            expect(chartKindsFor(question, "single_wave")).toEqual([
                "bar_horizontal"
            ]);
        });

        it("counts the free-text option against both thresholds", () => {
            const atCap = choiceWith(CHART_VERTICAL_MAX_OPTIONS, 4);
            expect(
                chartKindsFor(
                    { ...atCap, allowOther: true, otherLabel: "Muu" },
                    "single_wave"
                )
            ).toEqual(["bar_horizontal"]);

            const longOther: MultiChoiceQuestion = {
                ...multiChoice,
                options: [
                    { value: "a", label: "A" },
                    { value: "b", label: "B" }
                ],
                allowOther: true,
                otherLabel: "y".repeat(CHART_SHORT_LABEL_MAX + 1)
            };
            expect(chartKindsFor(longOther, "single_wave")).toEqual([
                "bar_horizontal"
            ]);
        });
    });

    describe("ordered questions", () => {
        it("gives opinion_scale, nps and matrix_single the ramp", () => {
            for (const question of [opinionScale, nps, matrixSingle]) {
                expect(chartKindsFor(question, "single_wave")).toEqual([
                    "ramp_bar",
                    "ramp_stacked"
                ]);
            }
        });

        it("never offers the categorical bars for ordered data", () => {
            // DESIGN §7: ordered data is always the ramp, never the
            // categorical palette.
            for (const question of [opinionScale, nps, matrixSingle]) {
                const kinds = chartKindsFor(question, "series");
                expect(kinds).not.toContain("bar_horizontal");
                expect(kinds).not.toContain("bar_vertical");
            }
        });
    });

    describe("text questions", () => {
        it("offers nothing to chart, in either shape", () => {
            for (const question of [shortText, longText]) {
                expect(chartKindsFor(question, "single_wave")).toEqual([]);
                expect(chartKindsFor(question, "series")).toEqual([]);
                expect(defaultChartKind(question, "single_wave")).toBeNull();
            }
        });
    });

    describe("the line encoding", () => {
        it("is offered by nothing on a single wave", () => {
            for (const question of ALL_QUESTIONS) {
                expect(chartKindsFor(question, "single_wave")).not.toContain(
                    "line"
                );
            }
        });

        it("is offered by every chartable question in a series", () => {
            for (const question of ALL_QUESTIONS) {
                const single = chartKindsFor(question, "single_wave");
                const series = chartKindsFor(question, "series");
                if (single.length === 0) {
                    expect(series).toEqual([]);
                    continue;
                }
                expect(series).toContain("line");
            }
        });

        it("does not become the default just because a series exists", () => {
            for (const question of ALL_QUESTIONS) {
                const single = defaultChartKind(question, "single_wave");
                expect(defaultChartKind(question, "series")).toBe(single);
            }
        });
    });
});

describe("supportsChartKind", () => {
    it("agrees with chartKindsFor for every question and kind", () => {
        for (const question of ALL_QUESTIONS) {
            for (const shape of ["single_wave", "series"] as const) {
                const kinds = chartKindsFor(question, shape);
                for (const kind of CHART_KINDS) {
                    expect(supportsChartKind(question, shape, kind)).toBe(
                        kinds.includes(kind)
                    );
                }
            }
        }
    });

    it("rejects a stored preference the question no longer supports", () => {
        // The owner's chosen kind is persisted per question key, so an edit
        // that adds a sixth option has to be able to invalidate it.
        const narrow = choiceWith(3, 4);
        const wide = choiceWith(CHART_VERTICAL_MAX_OPTIONS + 1, 4);
        const kind: ChartKind = "bar_vertical";

        expect(supportsChartKind(narrow, "single_wave", kind)).toBe(true);
        expect(supportsChartKind(wide, "single_wave", kind)).toBe(false);
    });
});

describe("the exhaustive switch", () => {
    it("covers every answerable question type", () => {
        // ALL_QUESTIONS is one of each; if a tenth type is added to the union
        // without a case here, `chartKindsFor` fails to compile — this only
        // guards against the fixture list going stale.
        const covered = new Set(ALL_QUESTIONS.map(q => q.type));
        expect(covered.size).toBe(ALL_QUESTIONS.length);

        for (const question of ALL_QUESTIONS) {
            expect(() =>
                chartKindsFor(question as AnswerableQuestion, "single_wave")
            ).not.toThrow();
        }
    });

    it("does not key anything on the question id", () => {
        const moved = { ...singleChoice, id: questionId(crypto.randomUUID()) };
        expect(chartKindsFor(moved, "single_wave")).toEqual(
            chartKindsFor(singleChoice, "single_wave")
        );
    });
});
