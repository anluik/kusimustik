import type { AnswerValue } from "@/domain/answer";
import { newResponseId, newSurveyId, questionId } from "@/domain/ids";
import type { QuestionId } from "@/domain/ids";
import type {
    OpinionScaleQuestion,
    SingleChoiceQuestion,
    StatementElement,
    SurveyElement
} from "@/domain/question";
import { SurveySchema } from "@/domain/survey";
import { ResponseRecordSchema } from "@/lib/db/responses";
import type { WaveResponses } from "@/lib/db/waves";

/**
 * Hand-built waves for the comparison tests.
 *
 * Deliberately tiny — three respondents, not thirty — because what these tests
 * check is the *alignment*, not the arithmetic. `aggregate()` has its own
 * fixtures for the arithmetic, and `lib/db/waves.db.test.ts` proves the same
 * alignment against the seed and a real database.
 *
 * Every question id is derived from its wave *and* its key, which is the point:
 * two waves asking the same key hold two different questions, and anything that
 * joined on `id` would find nothing.
 *
 * Not imported by application code. It sits beside the module it serves, like
 * `lib/db/test-support.ts`, so `tsc` and ESLint cover it like anything else.
 */

const WAVE_GROUP = "44444444-4444-4444-8444-444444444444";

/** Stable per string, and hex, so it can be dropped into a UUID. */
function digest(value: string, length: number): string {
    const sum = [...value].reduce(
        (total, char) => (total * 31 + char.charCodeAt(0)) % 0xffffffff,
        7
    );
    return sum.toString(16).padStart(length, "0").slice(-length);
}

const qid = (wave: string, key: string): QuestionId =>
    questionId(
        `${digest(wave, 8)}-0000-4000-8000-${digest(`${wave}:${key}`, 12)}`
    );

/** A choice question under `key`, with ids that differ from wave to wave. */
export function choice(
    wave: string,
    key: string,
    options: readonly string[] = ["a", "b", "c"]
): SingleChoiceQuestion {
    return {
        type: "single_choice",
        isAnswerable: true,
        id: qid(wave, key),
        key,
        title: `${key} in ${wave}`,
        required: true,
        allowOther: false,
        options: options.map(value => ({
            value,
            label: `${value.toUpperCase()} ${wave}`
        }))
    };
}

export function scale(wave: string, key: string): OpinionScaleQuestion {
    return {
        type: "opinion_scale",
        isAnswerable: true,
        id: qid(wave, key),
        key,
        title: `${key} in ${wave}`,
        required: true,
        max: 5
    };
}

export function statement(wave: string, key: string): StatementElement {
    return {
        type: "statement",
        isAnswerable: false,
        id: qid(wave, key),
        key,
        title: `${key} in ${wave}`
    };
}

let created = 0;

/**
 * One wave: a published survey and the responses it collected. The answers are
 * given per respondent, keyed by question id, exactly as `ResponseRecord`
 * carries them — a missing key is a skip.
 *
 * `createdAt` follows the order the waves are built in, which is the order the
 * repository returns them: oldest first.
 */
export function wave(
    label: string,
    elements: readonly SurveyElement[],
    answers: readonly Readonly<Record<string, AnswerValue>>[] = []
): WaveResponses {
    const survey = SurveySchema.parse({
        id: newSurveyId(),
        title: `Annual survey ${label}`,
        status: "published",
        slug: `annual-${digest(label, 8)}`,
        locale: "et",
        locales: ["et"],
        waveGroupId: WAVE_GROUP,
        waveLabel: label,
        elements
    });

    created += 1;
    const createdAt = `2020-01-01T00:00:${String(created).padStart(2, "0")}+00:00`;

    return {
        survey,
        createdAt,
        responses: answers.map((given, index) =>
            ResponseRecordSchema.parse({
                id: newResponseId(),
                surveyId: survey.id,
                surveyVersion: 1,
                locale: "et",
                submittedAt: `2026-01-01T10:00:${String(index).padStart(2, "0")}+00:00`,
                answers: given
            })
        )
    };
}
