/**
 * How a timestamp is described in the list: "today 14:32", "yesterday 17:04",
 * or a plain date.
 *
 * Kept separate from the rendering so that the *decision* is pure and testable
 * and the *wording* stays in the message catalogue. The caller supplies `now`
 * — the page reads it once on the server and passes it to the client component
 * — so that the server render and the hydrated render cannot disagree about
 * what day it is.
 */

export type TimestampDescription =
    | { readonly kind: "today" }
    | { readonly kind: "yesterday" }
    | { readonly kind: "date" };

/**
 * The calendar date in the given zone, as `YYYY-MM-DD`. `en-CA` is the shortest
 * route to ISO ordering out of `Intl`, and the string form makes the day
 * arithmetic below exact rather than millisecond-based — days are not all 24
 * hours long, which is the whole reason this function exists.
 */
function dateKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

export function describeTimestamp(
    iso: string,
    now: Date,
    timeZone: string
): TimestampDescription {
    const date = new Date(iso);
    const today = dateKey(now, timeZone);

    if (dateKey(date, timeZone) === today) return { kind: "today" };

    // Step back a full day from `now` and ask for *its* calendar date, rather
    // than subtracting one from the date parts: that gets the month and year
    // rollovers right for free, and a daylight-saving shift moves the instant
    // but not the date it lands on.
    const yesterday = dateKey(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
        timeZone
    );
    if (dateKey(date, timeZone) === yesterday) return { kind: "yesterday" };

    return { kind: "date" };
}
