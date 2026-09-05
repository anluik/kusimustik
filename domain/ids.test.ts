import { describe, expect, it } from "vitest";

import {
    newQuestionId,
    newResponseId,
    newSurveyId,
    newWaveGroupId,
    questionId,
    responseId,
    surveyId,
    waveGroupId
} from "@/domain/ids";

const UUID = "6f1c2b4e-8a3d-4b1f-9c2e-0d5a7b8c9e10";

describe("ids", () => {
    it("accepts a well-formed uuid for every brand", () => {
        expect(surveyId(UUID)).toBe(UUID);
        expect(questionId(UUID)).toBe(UUID);
        expect(responseId(UUID)).toBe(UUID);
        expect(waveGroupId(UUID)).toBe(UUID);
    });

    it("rejects anything that is not a uuid", () => {
        expect(() => surveyId("not-a-uuid")).toThrow();
        expect(() => questionId("")).toThrow();
    });

    it("generates fresh, distinct ids", () => {
        const ids = new Set([
            newSurveyId(),
            newQuestionId(),
            newResponseId(),
            newWaveGroupId()
        ]);
        expect(ids.size).toBe(4);
        for (const id of ids) expect(() => surveyId(id)).not.toThrow();
    });
});
