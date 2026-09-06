import { describe, expect, it } from "vitest";

import { buildAnswerSchema } from "@/domain/answer";
import { aggregate } from "@/domain/aggregate";
import { isAnswerableElement } from "@/domain/question";
import type { Survey } from "@/domain/survey";
import { answersForQuestion, listResponses } from "@/lib/db/responses";
import type { ResponseRecord } from "@/lib/db/responses";
import { getSurvey, listSurveys } from "@/lib/db/surveys";
import { signIn } from "@/lib/db/test-support";
import type { Db } from "@/lib/db/types";

/**
 * The seed's promise from Phase 2: `pnpm db:reset` leaves two comparable waves
 * to look at. Run `pnpm db:reset` before this file if it has drifted.
 */

const OWNER_EMAIL = "owner@kusimustik.test";
const OWNER_PASSWORD = "password123";

type Wave = { survey: Survey; responses: ResponseRecord[] };

async function loadWaves(db: Db): Promise<Wave[]> {
    const summaries = await listSurveys(db);
    const waves: Wave[] = [];

    for (const summary of summaries) {
        const record = await getSurvey(db, summary.id);
        if (record === null) throw new Error(`survey ${summary.id} vanished`);
        waves.push({
            survey: record.survey,
            responses: await listResponses(db, summary.id)
        });
    }

    return waves.sort((a, b) =>
        (a.survey.waveLabel ?? "").localeCompare(b.survey.waveLabel ?? "")
    );
}

describe("the seeded waves", () => {
    it("gives the owner two published waves of one survey", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await loadWaves(db);

        expect(waves.map(wave => wave.survey.waveLabel)).toEqual([
            "2025",
            "2026"
        ]);
        expect(waves.every(wave => wave.survey.status === "published")).toBe(
            true
        );

        const [first, second] = waves;
        expect(first?.survey.waveGroupId).toBe(second?.survey.waveGroupId);
    });

    it("shares question keys across the waves but not question ids", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const [first, second] = await loadWaves(db);

        const keys = (survey: Survey | undefined) =>
            survey?.elements.map(element => element.key) ?? [];
        expect(keys(first?.survey)).toEqual(keys(second?.survey));
        expect(keys(first?.survey)).toContain("recommend");

        const ids = (survey: Survey | undefined) =>
            new Set(survey?.elements.map(element => element.id));
        const shared = [...ids(first?.survey)].filter(id =>
            ids(second?.survey).has(id)
        );
        expect(shared).toEqual([]);

        // The point of keying on `key`: a reworded question still lines up.
        const title = (survey: Survey | undefined, key: string) =>
            survey?.elements.find(element => element.key === key)?.title;
        expect(title(first?.survey, "satisfaction")).not.toBe(
            title(second?.survey, "satisfaction")
        );
    });

    it("holds thirty responses per wave, all of them valid answers", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await loadWaves(db);

        for (const wave of waves) {
            expect(wave.responses).toHaveLength(30);

            for (const question of wave.survey.elements.filter(
                isAnswerableElement
            )) {
                const schema = buildAnswerSchema(question);
                for (const response of wave.responses) {
                    expect(() =>
                        schema.parse(response.answers[question.id] ?? null)
                    ).not.toThrow();
                }
            }
        }
    });

    it("has the two waves differing where they should", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const waves = await loadWaves(db);

        const summaryFor = (wave: Wave | undefined, key: string) => {
            const question = wave?.survey.elements
                .filter(isAnswerableElement)
                .find(element => element.key === key);
            if (question === undefined || wave === undefined) {
                throw new Error(`no question ${key}`);
            }
            return aggregate(
                question,
                answersForQuestion(wave.responses, question.id)
            );
        };

        const [first, second] = waves;

        const nps2025 = summaryFor(first, "recommend");
        const nps2026 = summaryFor(second, "recommend");
        expect(nps2025.kind).toBe("nps");
        expect(nps2025.kind === "nps" && nps2025.score).toBe(-10);
        expect(nps2026.kind === "nps" && nps2026.score).toBe(40);

        const scale2025 = summaryFor(first, "satisfaction");
        const scale2026 = summaryFor(second, "satisfaction");
        expect(scale2025.kind === "numeric" && scale2025.mean).toBe(3.17);
        expect(scale2026.kind === "numeric" && scale2026.mean).toBe(4);

        // Optional questions are genuinely skipped by some respondents.
        const city = summaryFor(first, "city");
        expect(city.skippedCount).toBeGreaterThan(0);
        expect(city.answeredCount + city.skippedCount).toBe(30);
    });
});
