import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { surveyId as toSurveyId } from "@/domain/ids";
import { resolveSurvey } from "@/domain/localize";
import { listResponses } from "@/lib/db/responses";
import { getSurvey } from "@/lib/db/surveys";
import { createTestUser, deleteTestUser, signIn } from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import { buildCsvFile, buildCsvTable } from "@/lib/results/csv";

/**
 * The CSV export against a real database (docs/PLAN.md Phase 8).
 *
 * The unit tests prove the shaping; what needs a database is the pair of
 * properties the download route leans on and cannot check for itself: that the
 * file is built from the same rows the results page reads, and that a second
 * owner asking for someone else's survey gets nothing rather than an error —
 * which is what makes "not yours" and "deleted" the same 404 instead of an
 * oracle for which survey ids exist.
 */

const SEED_WAVE_ONE = toSurveyId("00000000-0000-4000-8000-0000000000a1");
const OWNER_EMAIL = "owner@kusimustik.test";
const OWNER_PASSWORD = "password123";

const LABELS = {
    responseId: "Vastuse ID",
    submittedAt: "Esitatud",
    locale: "Keel",
    surveyVersion: "Versioon"
} as const;

/** Wave one: 4 metadata columns, then 13 from its nine elements. */
const EXPECTED_COLUMNS = 17;

describe("the seeded survey's export", () => {
    it("is one row per response, every row the same width", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const record = await getSurvey(db, SEED_WAVE_ONE);
        expect(record).not.toBeNull();

        const responses = await listResponses(db, SEED_WAVE_ONE);
        const table = buildCsvTable(
            record === null ? [] : resolveSurvey(record.survey).elements,
            responses,
            LABELS
        );

        // The seed is 30 responses per wave; `lib/db/seed.db.test.ts` owns
        // that number, so this asserts the relationship rather than restating
        // it.
        expect(table).toHaveLength(responses.length + 1);
        for (const row of table) {
            expect(row).toHaveLength(EXPECTED_COLUMNS);
        }
    });

    it("headers the columns with what the author wrote", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const record = await getSurvey(db, SEED_WAVE_ONE);
        const [header] = buildCsvTable(
            record === null ? [] : resolveSurvey(record.survey).elements,
            [],
            LABELS
        );

        expect(header?.slice(0, 4)).toEqual([
            "Vastuse ID",
            "Esitatud",
            "Keel",
            "Versioon"
        ]);
        expect(header).toContain("Milline roll kirjeldab teid kõige paremini?");
        // A multi-choice fans out; a matrix fans out per row.
        expect(header).toContain("Kust saite küsitluse kohta teada? [E-kiri]");
        expect(header).toContain("Hinnake meie tiimi [Kiirus]");
    });

    it("writes the labels a respondent saw", async () => {
        const db = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
        const record = await getSurvey(db, SEED_WAVE_ONE);
        const responses = await listResponses(db, SEED_WAVE_ONE);

        const file = buildCsvFile(
            record === null ? [] : resolveSurvey(record.survey).elements,
            responses,
            LABELS
        );

        expect(file.startsWith("﻿")).toBe(true);
        expect(file).toContain("\r\n");
        // Option labels, not the `student` / `ee` stored under them.
        expect(file).toMatch(/Üliõpilane|Õppejõud|Tugitöötaja/);
        expect(file).toMatch(/Eesti|Läti|Leedu|Soome/);
    });
});

describe("another owner", () => {
    let stranger: TestUser;

    beforeAll(async () => {
        stranger = await createTestUser("csv-stranger");
    });

    afterAll(async () => {
        await deleteTestUser(stranger);
    });

    it("cannot read the survey or its responses at all", async () => {
        // RLS, not application code, is what answers this — so the route's
        // 404 falls out of the read returning nothing.
        expect(await getSurvey(stranger.db, SEED_WAVE_ONE)).toBeNull();
        expect(await listResponses(stranger.db, SEED_WAVE_ONE)).toEqual([]);
    });
});
