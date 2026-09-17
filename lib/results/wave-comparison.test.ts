import { describe, expect, it } from "vitest";

import type { ComparisonRow } from "@/domain/comparison";
import { newComparisonRowId, newQuestionId } from "@/domain/ids";
import type { NpsQuestion } from "@/domain/question";
import type { WaveResponses } from "@/lib/db/waves";
import { buildComparison } from "@/lib/results/wave-comparison";
import type { WaveComparison } from "@/lib/results/wave-comparison";
import {
    byKey,
    choice,
    compareByKey,
    scale,
    statement,
    wave
} from "@/lib/results/wave-fixtures";

/**
 * Drawing the owner's rows, without a database. `lib/db/waves.db.test.ts`
 * reads the seeded comparison end to end; this covers the shapes a seed does
 * not hold — a row with a gap, a row that stopped holding, a removed question.
 */

function titles(comparison: WaveComparison): readonly string[] {
    return comparison.rows.map(row => row.question.title);
}

function states(comparison: WaveComparison, index = 0): readonly string[] {
    const row = comparison.rows[index];
    if (row === undefined) throw new Error(`no row ${index}`);
    return row.cells.map(cell => cell.state);
}

function row(
    waves: readonly WaveResponses[],
    pick: readonly (number | undefined)[]
): ComparisonRow {
    return {
        id: newComparisonRowId(),
        matches: waves.flatMap((each, index) => {
            const at = pick[index];
            const element =
                at === undefined ? undefined : each.survey.elements[at];
            return element === undefined
                ? []
                : [{ surveyId: each.survey.id, questionId: element.id }];
        })
    };
}

describe("buildComparison", () => {
    it("keeps the waves in the order they arrive, oldest first", () => {
        const comparison = compareByKey([
            wave("2025", [choice("2025", "role")]),
            wave("2026", [choice("2026", "role")])
        ]);

        expect(comparison.waves.map(w => w.waveLabel)).toEqual([
            "2025",
            "2026"
        ]);
    });

    it("orders rows by the newest wave, then by what only older ones ask", () => {
        const comparison = compareByKey([
            wave("2025", [
                choice("2025", "role"),
                choice("2025", "dropped"),
                scale("2025", "satisfaction")
            ]),
            wave("2026", [
                scale("2026", "satisfaction"),
                choice("2026", "role"),
                choice("2026", "added")
            ])
        ]);

        expect(titles(comparison)).toEqual([
            "satisfaction in 2026",
            "role in 2026",
            "added in 2026",
            "dropped in 2025"
        ]);
    });

    it("summarises each wave against its own definition and answers", () => {
        const older = choice("2025", "role");
        const newer = choice("2026", "role");

        const comparison = compareByKey([
            wave(
                "2025",
                [older],
                [
                    { [older.id]: { type: "single_choice", value: "a" } },
                    { [older.id]: { type: "single_choice", value: "b" } }
                ]
            ),
            wave(
                "2026",
                [newer],
                [{ [newer.id]: { type: "single_choice", value: "a" } }]
            )
        ]);

        const [role] = comparison.rows;
        expect(role?.question.id).toBe(newer.id);

        const [first, second] = role?.cells ?? [];
        if (first?.state !== "compared" || second?.state !== "compared") {
            throw new Error("both waves should have been compared");
        }
        expect(first.summary.questionId).toBe(older.id);
        expect(first.summary.answeredCount).toBe(2);
        expect(first.removed).toBe(false);
        expect(second.summary.questionId).toBe(newer.id);
        expect(second.summary.answeredCount).toBe(1);
    });

    it("says a row holds nothing from a wave rather than showing nought", () => {
        const comparison = compareByKey([
            wave("2025", [choice("2025", "role")]),
            wave("2026", []),
            wave("2027", [choice("2027", "role")])
        ]);

        expect(states(comparison)).toEqual([
            "compared",
            "notMatched",
            "compared"
        ]);
        expect(comparison.rows[0]?.comparedCount).toBe(2);
        expect(comparison.rows[0]?.missingCount).toBe(1);
    });

    it("names the wave whose question stopped satisfying the row", () => {
        // The 2027 question was retyped in the builder after it was matched.
        // The row is anchored on the two that still agree, so 2027 is the one
        // reported — not the other two.
        const waves = [
            wave("2025", [scale("2025", "mood")]),
            wave("2026", [scale("2026", "mood")]),
            wave("2027", [choice("2027", "mood")])
        ];
        const comparison = buildComparison({
            waves,
            rows: [row(waves, [0, 0, 0])],
            removed: new Map()
        });

        expect(states(comparison)).toEqual([
            "compared",
            "compared",
            "mismatched"
        ]);
        const [, , third] = comparison.rows[0]?.cells ?? [];
        expect(third?.state === "mismatched" && third.type).toBe(
            "single_choice"
        );
        expect(comparison.rows[0]?.question.type).toBe("opinion_scale");
    });

    it("never gives a statement a card, and drops a row with nothing left", () => {
        const waves = [
            wave("2026", [statement("2026", "intro"), choice("2026", "role")])
        ];
        const empty: ComparisonRow = {
            id: newComparisonRowId(),
            matches: [
                {
                    surveyId: waves[0]?.survey.id ?? never(),
                    questionId: newQuestionId()
                }
            ]
        };
        const comparison = buildComparison({
            waves,
            rows: [...byKey(waves), empty],
            removed: new Map()
        });
        expect(titles(comparison)).toEqual(["role in 2026"]);
    });

    it("still compares a removed question, from its last definition", () => {
        const kept = choice("2025", "role");
        const gone: NpsQuestion = {
            type: "nps",
            isAnswerable: true,
            id: newQuestionId(),
            key: "recommend",
            title: "Recommend (removed)",
            required: true
        };
        const current: NpsQuestion = {
            ...gone,
            id: newQuestionId(),
            title: "Recommend"
        };
        const waves = [
            // 2025 no longer holds `gone` in its document, but its answers do.
            wave("2025", [kept], [{ [gone.id]: { type: "nps", value: 9 } }]),
            wave("2026", [current])
        ];
        const rows: ComparisonRow[] = [
            {
                id: newComparisonRowId(),
                matches: [
                    {
                        surveyId: waves[0]?.survey.id ?? never(),
                        questionId: gone.id
                    },
                    {
                        surveyId: waves[1]?.survey.id ?? never(),
                        questionId: current.id
                    }
                ]
            }
        ];

        const comparison = buildComparison({
            waves,
            rows,
            removed: new Map([
                [
                    gone.id,
                    { surveyId: waves[0]?.survey.id ?? never(), question: gone }
                ]
            ])
        });

        const [first] = comparison.rows[0]?.cells ?? [];
        expect(first?.state).toBe("compared");
        expect(first?.state === "compared" && first.removed).toBe(true);
        expect(first?.state === "compared" && first.summary.answeredCount).toBe(
            1
        );
    });

    it("holds a wave with no responses as a wave with none", () => {
        const comparison = compareByKey([
            wave("2025", [choice("2025", "role")]),
            wave("2026", [choice("2026", "role")])
        ]);

        const [, second] = comparison.rows[0]?.cells ?? [];
        expect(second?.state).toBe("compared");
        expect(
            second?.state === "compared" && second.summary.responseCount
        ).toBe(0);
        expect(comparison.waves[1]?.responseCount).toBe(0);
    });
});

function never(): never {
    throw new Error("fixture missing");
}
