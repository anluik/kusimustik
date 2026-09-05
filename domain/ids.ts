import { z } from "zod";

/**
 * Branded identifiers. All four are UUIDs at runtime; the brands exist so that
 * a `QuestionId` can never be passed where a `SurveyId` is expected, and so
 * that a bare `string` from a request body cannot be used as either without
 * going through a constructor that validates it.
 *
 * Construct with the lowercase helpers (validating) or the `new*` helpers
 * (generating). Never assert a raw string into a branded type.
 */

export const SurveyIdSchema = z.uuid().brand<"SurveyId">();
export type SurveyId = z.infer<typeof SurveyIdSchema>;

export const QuestionIdSchema = z.uuid().brand<"QuestionId">();
export type QuestionId = z.infer<typeof QuestionIdSchema>;

export const ResponseIdSchema = z.uuid().brand<"ResponseId">();
export type ResponseId = z.infer<typeof ResponseIdSchema>;

/** Groups the waves of one recurring survey. See docs/DECISIONS.md 003. */
export const WaveGroupIdSchema = z.uuid().brand<"WaveGroupId">();
export type WaveGroupId = z.infer<typeof WaveGroupIdSchema>;

export const surveyId = (raw: string): SurveyId => SurveyIdSchema.parse(raw);
export const questionId = (raw: string): QuestionId =>
    QuestionIdSchema.parse(raw);
export const responseId = (raw: string): ResponseId =>
    ResponseIdSchema.parse(raw);
export const waveGroupId = (raw: string): WaveGroupId =>
    WaveGroupIdSchema.parse(raw);

export const newSurveyId = (): SurveyId => surveyId(crypto.randomUUID());
export const newQuestionId = (): QuestionId => questionId(crypto.randomUUID());
export const newResponseId = (): ResponseId => responseId(crypto.randomUUID());
export const newWaveGroupId = (): WaveGroupId =>
    waveGroupId(crypto.randomUUID());
