import { describe, expect, it } from "vitest";

import { aggregate } from "@/domain/aggregate";
import { buildAnswerSchema } from "@/domain/answer";
import {
    ALL_QUESTIONS,
    RESPONSES,
    answersFor,
    dropdown,
    longText,
    matrixSingle,
    multiChoice,
    nps,
    opinionScale,
    shortText,
    singleChoice
} from "@/domain/test-fixtures";

describe("the 20-response fixture", () => {
    it("has twenty responses", () => {
        expect(RESPONSES).toHaveLength(20);
    });

    it("contains only answers its own question would accept", () => {
        for (const question of ALL_QUESTIONS) {
            const schema = buildAnswerSchema(question);
            for (const answer of answersFor(question)) {
                expect(schema.safeParse(answer).success).toBe(true);
            }
        }
    });

    it("aggregates every answerable type without falling through", () => {
        for (const question of ALL_QUESTIONS) {
            const summary = aggregate(question, answersFor(question));
            expect(summary.questionKey).toBe(question.key);
            expect(summary.questionId).toBe(question.id);
            expect(summary.responseCount).toBe(20);
            expect(summary.answeredCount + summary.skippedCount).toBe(20);
        }
    });
});

describe("aggregate — single_choice", () => {
    const summary = aggregate(singleChoice, answersFor(singleChoice));

    it("counts each option and its share of the answers", () => {
        expect(summary.kind).toBe("categorical");
        if (summary.kind !== "categorical") return;
        expect(summary.answeredCount).toBe(20);
        expect(summary.skippedCount).toBe(0);
        expect(summary.multiSelect).toBe(false);
        expect(summary.options).toEqual([
            { value: "dev", label: "Developer", count: 10, percentage: 50 },
            { value: "design", label: "Designer", count: 5, percentage: 25 },
            { value: "pm", label: "Product manager", count: 3, percentage: 15 }
        ]);
    });

    it("keeps the free-text 'other' answers out of the option counts", () => {
        if (summary.kind !== "categorical") return;
        expect(summary.other).toEqual({
            label: "Other",
            count: 2,
            percentage: 10,
            responses: ["Student", "Founder"]
        });
    });

    it("reports options in the order the survey declares them, not by popularity", () => {
        if (summary.kind !== "categorical") return;
        expect(summary.options.map(o => o.value)).toEqual([
            "dev",
            "design",
            "pm"
        ]);
    });
});

describe("aggregate — multi_choice", () => {
    const summary = aggregate(multiChoice, answersFor(multiChoice));

    it("counts selections against the number of respondents, so shares exceed 100%", () => {
        expect(summary.kind).toBe("categorical");
        if (summary.kind !== "categorical") return;
        expect(summary.multiSelect).toBe(true);
        expect(summary.options).toEqual([
            { value: "email", label: "Email", count: 20, percentage: 100 },
            { value: "slack", label: "Slack", count: 15, percentage: 75 },
            { value: "phone", label: "Phone", count: 5, percentage: 25 },
            { value: "in_person", label: "In person", count: 5, percentage: 25 }
        ]);
        const total = summary.options.reduce((sum, o) => sum + o.percentage, 0);
        expect(total).toBeGreaterThan(100);
    });

    it("has no 'other' bucket when the question does not allow one", () => {
        if (summary.kind !== "categorical") return;
        expect(summary.other).toBeNull();
    });
});

describe("aggregate — dropdown", () => {
    it("behaves like any other categorical question", () => {
        const summary = aggregate(dropdown, answersFor(dropdown));
        if (summary.kind !== "categorical")
            return expect.fail("expected a categorical summary");
        expect(
            summary.options.map(o => [o.value, o.count, o.percentage])
        ).toEqual([
            ["ee", 12, 60],
            ["fi", 5, 25],
            ["se", 3, 15]
        ]);
    });
});

describe("aggregate — text", () => {
    it("lists short_text answers and counts the skips", () => {
        const summary = aggregate(shortText, answersFor(shortText));
        if (summary.kind !== "text")
            return expect.fail("expected a text summary");
        expect(summary.answeredCount).toBe(15);
        expect(summary.skippedCount).toBe(5);
        expect(summary.responses).toHaveLength(15);
        expect(summary.responses.slice(0, 2)).toEqual(["Tallinn", "Tallinn"]);
    });

    it("lists long_text answers", () => {
        const summary = aggregate(longText, answersFor(longText));
        if (summary.kind !== "text")
            return expect.fail("expected a text summary");
        expect(summary.answeredCount).toBe(4);
        expect(summary.responses).toEqual([
            "Great tool.",
            "Needs a dark mode.",
            "Fast and simple.",
            "More question types please."
        ]);
    });
});

describe("aggregate — opinion_scale", () => {
    const summary = aggregate(opinionScale, answersFor(opinionScale));

    it("reports mean and median", () => {
        if (summary.kind !== "numeric")
            return expect.fail("expected a numeric summary");
        expect(summary.mean).toBe(3.7);
        expect(summary.median).toBe(4);
    });

    it("reports the configured bounds and endpoint labels", () => {
        if (summary.kind !== "numeric")
            return expect.fail("expected a numeric summary");
        expect([summary.min, summary.max]).toEqual([1, 5]);
        expect([summary.minLabel, summary.maxLabel]).toEqual([
            "Not at all",
            "Very"
        ]);
    });

    it("emits one distribution bucket per step, including empty ones", () => {
        if (summary.kind !== "numeric")
            return expect.fail("expected a numeric summary");
        expect(summary.distribution).toEqual([
            { value: 1, count: 1, percentage: 5 },
            { value: 2, count: 2, percentage: 10 },
            { value: 3, count: 5, percentage: 25 },
            { value: 4, count: 6, percentage: 30 },
            { value: 5, count: 6, percentage: 30 }
        ]);
    });

    it("survives a question nobody answered", () => {
        const empty = aggregate({ ...opinionScale, required: false }, [
            null,
            null,
            null
        ]);
        if (empty.kind !== "numeric")
            return expect.fail("expected a numeric summary");
        expect(empty.answeredCount).toBe(0);
        expect(empty.mean).toBeNull();
        expect(empty.median).toBeNull();
        expect(
            empty.distribution.every(b => b.count === 0 && b.percentage === 0)
        ).toBe(true);
    });
});

describe("aggregate — nps", () => {
    const summary = aggregate(nps, answersFor(nps));

    it("splits promoters, passives and detractors on the standard boundaries", () => {
        if (summary.kind !== "nps")
            return expect.fail("expected an nps summary");
        expect(summary.promoters).toBe(10);
        expect(summary.passives).toBe(5);
        expect(summary.detractors).toBe(5);
    });

    it("scores promoters minus detractors as a percentage of answers", () => {
        if (summary.kind !== "nps")
            return expect.fail("expected an nps summary");
        expect(summary.score).toBe(25);
    });

    it("still reports mean, median and the full 0-10 distribution", () => {
        if (summary.kind !== "nps")
            return expect.fail("expected an nps summary");
        expect(summary.mean).toBe(7.5);
        expect(summary.median).toBe(8.5);
        expect(summary.distribution).toHaveLength(11);
        expect(summary.distribution.map(b => b.count)).toEqual([
            1, 0, 0, 2, 0, 0, 2, 3, 2, 5, 5
        ]);
    });

    it("has no score when nobody answered", () => {
        const empty = aggregate({ ...nps, required: false }, [null, null]);
        if (empty.kind !== "nps") return expect.fail("expected an nps summary");
        expect(empty.score).toBeNull();
        expect(empty.promoters + empty.passives + empty.detractors).toBe(0);
    });
});

describe("aggregate — matrix_single", () => {
    const summary = aggregate(matrixSingle, answersFor(matrixSingle));

    it("counts each row against each column", () => {
        if (summary.kind !== "matrix")
            return expect.fail("expected a matrix summary");
        expect(summary.columns.map(c => c.value)).toEqual([
            "low",
            "mid",
            "high"
        ]);
        expect(
            summary.rows.map(r => ({
                value: r.value,
                counts: r.cells.map(c => c.count)
            }))
        ).toEqual([
            { value: "speed", counts: [4, 6, 10] },
            { value: "quality", counts: [2, 8, 10] }
        ]);
    });

    it("takes each row's percentages against that row's own answers", () => {
        if (summary.kind !== "matrix")
            return expect.fail("expected a matrix summary");
        const speed = summary.rows[0];
        expect(speed?.answeredCount).toBe(20);
        expect(speed?.cells.map(c => c.percentage)).toEqual([20, 30, 50]);
        expect(summary.rows[1]?.cells.map(c => c.percentage)).toEqual([
            10, 40, 50
        ]);
    });
});
