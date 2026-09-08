import { z } from "zod";

/**
 * The two free, invisible bot filters the runner submits alongside its answers
 * (docs/PLAN.md Phase 9). A captcha is deliberately not here: DESIGN §10 makes
 * the respondent's phone the priority surface, and a third-party script is the
 * last thing that page needs. Turnstile is the documented escalation if real
 * abuse appears (docs/DECISIONS.md 025).
 *
 * Neither is a security control. Both travel in the request they are meant to
 * catch, so anyone who reads the payload can defeat them in a minute; what
 * they cost such a person is the minute. The rate limiter is the control, and
 * these keep the ordinary, unaimed form-filler out of it.
 */

/**
 * The honeypot's field name. Neutral on purpose: the bots this catches fill
 * every input they find, and a name like "website" or "email" is the one a
 * browser's own autofill would target — which would block a real respondent.
 */
export const HONEYPOT_FIELD = "kysimustik_hp";

/**
 * How briefly a submission may follow the form appearing.
 *
 * Two seconds, which is under the time it takes anyone to read a title and
 * touch one control, and far above a script's nothing. Low on purpose: the
 * cost of a floor that is too high is a real respondent refused, and the cost
 * of one that is too low is a bot that waits.
 */
export const MIN_SUBMIT_MS = 2_000;

export const SubmitGuardSchema = z.object({
    /** The honeypot's value. Empty from a human, anything at all from a bot. */
    hp: z.string(),
    /** Milliseconds since the runner mounted, from a monotonic clock. */
    elapsedMs: z.int().nonnegative()
});
export type SubmitGuard = z.infer<typeof SubmitGuardSchema>;

export function looksAutomated(guard: SubmitGuard): boolean {
    // Exactly empty, not merely blank: a field nobody can see has no reason to
    // hold whitespace either, and trimming would hand a bot a way through.
    return guard.hp !== "" || guard.elapsedMs < MIN_SUBMIT_MS;
}

/**
 * Monotonic where the browser offers it, for the same reason
 * `lib/runner/analytics.ts` uses it: `performance.now()` does not move when
 * the system clock does, so a phone that resyncs its clock mid-survey cannot
 * turn an honest respondent into a suspiciously fast one.
 */
export function monotonicNow(): number {
    return typeof performance === "undefined" ? Date.now() : performance.now();
}
