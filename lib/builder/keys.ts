import type { QuestionId } from "@/domain/ids";
import { deriveQuestionKey } from "@/domain/question";

/**
 * Question keys in the builder: which are spoken for, and when one may still
 * follow its title.
 *
 * `key` is what wave comparison and CSV columns join on and is preserved
 * across duplication (docs/DECISIONS.md 003), so it cannot simply track the
 * title forever — rewording a question a year later would sever its own trend
 * line. But a key derived from the placeholder title a question is born with
 * (`uus_kusimus`) is no use either.
 *
 * So the key follows the title exactly as long as following it is provably
 * harmless, and freezes the moment it is not. See docs/DECISIONS.md 014.
 */

export const KEY_POLICIES = ["derive", "freeze"] as const;
export type KeyPolicy = (typeof KEY_POLICIES)[number];

/**
 * What the builder needs to know about a survey's keys, as one value.
 *
 * The two travel together because every place that mints or edits a key needs
 * both, and a call site that had to assemble them separately could — and did —
 * assemble only one.
 */
export type SurveyKeys = {
    readonly policy: KeyPolicy;
    /**
     * Keys this survey has already spent on questions that have since left the
     * document but kept their answers. A tombstoned row holds its key for the
     * life of the survey (`survey_questions_survey_key_idx`), because the
     * answers filed under it are still exported and still compared; handing
     * that key to a new question would file two different questions' answers
     * in one column.
     */
    readonly reserved: readonly string[];
};

/**
 * Nothing may join on this survey's keys yet if it has never been published —
 * so no answers exist — and it is the only wave in its group — so no sibling
 * survey's keys line up against it.
 */
export function keyPolicyFor(survey: {
    readonly publishedVersion: number | null;
    readonly waveCount: number;
}): KeyPolicy {
    return survey.publishedVersion === null && survey.waveCount <= 1
        ? "derive"
        : "freeze";
}

/**
 * What these functions need of an element: which one it is, and what key it
 * holds. Neither is a word, so both shapes of the document — the stored one
 * the builder's reducer holds and the single language its editors bind to —
 * satisfy it, and neither function has to care which it was handed.
 */
type KeyedElement = {
    readonly id: QuestionId;
    readonly key: string;
};

/**
 * Every key an element may not take: its siblings' keys, plus the keys the
 * survey's tombstoned questions still hold.
 *
 * `except` is the element being edited, which is allowed to keep its own key.
 */
export function takenKeys(
    elements: readonly KeyedElement[],
    keys: SurveyKeys,
    except?: KeyedElement
): readonly string[] {
    return [
        ...elements
            .filter(element => element.id !== except?.id)
            .map(element => element.key),
        ...keys.reserved
    ];
}

/**
 * The key an element should carry once it is retitled.
 *
 * Under `derive`, the key follows the title only while it still *is* the key
 * its current title derives to: that is what distinguishes a key nobody has
 * chosen from one somebody has, and it keeps a hand-written key intact. Under
 * `freeze` the key never moves.
 */
export function nextKeyFor(
    element: KeyedElement & { readonly title: string },
    title: string,
    siblings: readonly KeyedElement[],
    keys: SurveyKeys
): string {
    if (keys.policy === "freeze") return element.key;

    const taken = takenKeys(siblings, keys, element);
    if (element.key !== deriveQuestionKey(element.title, taken)) {
        return element.key;
    }
    return deriveQuestionKey(title, taken);
}
