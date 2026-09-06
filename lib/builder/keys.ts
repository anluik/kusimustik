import { deriveQuestionKey, type SurveyElement } from "@/domain/question";
import { takenKeys } from "@/lib/builder/new-element";

/**
 * When a question's `key` may still follow its title.
 *
 * `key` is what wave comparison and CSV columns join on and is preserved
 * across duplication (docs/DECISIONS.md 003), so it cannot simply track the
 * title forever — rewording a question a year later would sever its own trend
 * line. But a key derived from the placeholder title a question is born with
 * (`uus_kusimus`) is no use either, and there is no key editor yet.
 *
 * So the key follows the title exactly as long as following it is provably
 * harmless, and freezes the moment it is not. See docs/DECISIONS.md 014.
 */

export const KEY_POLICIES = ["derive", "freeze"] as const;
export type KeyPolicy = (typeof KEY_POLICIES)[number];

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
 * The key an element should carry once it is retitled.
 *
 * Under `derive`, the key follows the title only while it still *is* the key
 * its current title derives to: that is what distinguishes a key nobody has
 * chosen from one somebody has, and it will keep a hand-written key intact
 * once a key editor exists. Under `freeze` the key never moves.
 */
export function nextKeyFor(
    element: SurveyElement,
    title: string,
    siblings: readonly SurveyElement[],
    policy: KeyPolicy
): string {
    if (policy === "freeze") return element.key;

    const taken = takenKeys(siblings, element);
    if (element.key !== deriveQuestionKey(element.title, taken)) {
        return element.key;
    }
    return deriveQuestionKey(title, taken);
}
