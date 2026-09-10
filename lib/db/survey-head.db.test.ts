import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localizedText, withLocale } from "@/domain/content";
import {
    anonClient,
    createTestUser,
    deleteTestUser,
    npsQuestion,
    serviceClient,
    stored,
    testSlug
} from "@/lib/db/test-support";
import type { TestUser } from "@/lib/db/test-support";
import {
    createSurvey,
    getRunnerSurveyBySlug,
    publishSurvey,
    updateSurveyDefinition
} from "@/lib/db/surveys";
import type { SurveyRecord } from "@/lib/db/surveys";

/**
 * The survey's own title and intro, now that they are locale-keyed
 * (docs/DECISIONS.md 034).
 *
 * Two things are worth a database to prove. That a *single-language write*
 * keeps the other languages — the failure this shape invites is a rename that
 * quietly replaces three translations with one string, and it would leave no
 * trace. And that the column, the snapshot and the version trigger all agree
 * about a jsonb title, since the trigger's definition-change test compares the
 * two columns directly and was written when both were text.
 */

let owner: TestUser;
let survey: SurveyRecord;

beforeAll(async () => {
    owner = await createTestUser("survey-head");
    survey = await createSurvey(owner.db, {
        ownerId: owner.id,
        title: { et: "Maine", en: "Reputation", ru: "Репутация" },
        description: { et: "Kolm minutit." },
        locale: "et",
        locales: ["et", "en", "ru"],
        elements: stored([npsQuestion("recommend")])
    });
});

afterAll(async () => {
    await deleteTestUser(owner);
});

describe("a survey's own words", () => {
    it("round-trips every language the author wrote", async () => {
        expect(survey.survey.title).toEqual({
            et: "Maine",
            en: "Reputation",
            ru: "Репутация"
        });
        expect(survey.survey.description).toEqual({ et: "Kolm minutit." });
    });

    it("keeps the other languages when one of them is rewritten", async () => {
        const merged = withLocale(survey.survey.title, "et", "Maine 2026");
        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { title: merged }
        );

        expect(survey.survey.title).toEqual({
            et: "Maine 2026",
            en: "Reputation",
            ru: "Репутация"
        });
    });

    it("counts as a definition change, so the version moves", async () => {
        const before = survey.version;
        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { title: withLocale(survey.survey.title, "ru", "Репутация 2026") }
        );
        expect(survey.version).toBe(before + 1);
    });

    it("does not move the version when only the key order differs", async () => {
        // jsonb normalises key order on storage, so re-sending the same three
        // translations in a different order is not an edit. The trigger's
        // `is distinct from` gets this right for free, which is why it did not
        // have to be rewritten for the new column type.
        const before = survey.version;
        const reordered = Object.fromEntries(
            [...Object.entries(survey.survey.title)].reverse()
        );
        const saved = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { title: reordered }
        );
        expect(saved.version).toBe(before);
    });

    it("clears the intro when it is set to null", async () => {
        survey = await updateSurveyDefinition(
            owner.db,
            survey.survey.id,
            survey.version,
            { description: null }
        );
        expect(survey.survey.description).toBeUndefined();
    });

    it("snapshots the maps, not one language of them", async () => {
        const slug = testSlug("kolmes-keeles");
        survey = await publishSurvey(owner.db, survey.survey.id, slug);

        const snapshot = await owner.db
            .from("survey_versions")
            .select("title")
            .eq("survey_id", survey.survey.id)
            .eq("version", survey.publishedVersion ?? 0)
            .single();

        // A response is pinned to the wording it was answered against, and a
        // respondent who answered in Russian answered a Russian wording.
        expect(snapshot.data?.title).toEqual(survey.survey.title);
    });

    it("refuses a title written in no language at all", async () => {
        // The domain schema is the real validator, but the column is reachable
        // from psql and from a migration, so the shape is checked there too.
        const written = await serviceClient()
            .from("surveys")
            .insert({
                owner_id: owner.id,
                title: {},
                locale: "et"
            })
            .select("id")
            .maybeSingle();

        expect(written.error?.code).toBe("23514");
    });

    it("refuses a bare string, so the migration cannot be half applied", async () => {
        const written = await serviceClient()
            .from("surveys")
            .insert({
                owner_id: owner.id,
                title: localizedText("et", "Nimi").et ?? "",
                locale: "et"
            })
            .select("id")
            .maybeSingle();

        expect(written.error?.code).toBe("23514");
    });

    it("is what the runner reads, in the respondent's own language", async () => {
        const slug = survey.survey.slug ?? "";

        const estonian = await getRunnerSurveyBySlug(anonClient(), slug);
        expect(estonian?.survey.title).toBe("Maine 2026");

        const russian = await getRunnerSurveyBySlug(anonClient(), slug, "ru");
        expect(russian?.survey.title).toBe("Репутация 2026");
    });
});
