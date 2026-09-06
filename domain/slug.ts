/**
 * Public link slugs.
 *
 * A slug is assigned once, on first publish, and then never changes — a link
 * that has been mailed to two thousand respondents cannot be rewritten. So the
 * only thing generated here is the *candidate*: the repository tries it, and
 * asks for the next one if the unique index says it is taken.
 *
 * Everything returned satisfies `SurveySlugSchema` (3–80 characters, lowercase
 * alphanumerics separated by single hyphens). That is asserted in the tests
 * rather than by importing the schema, so this file stays free of even a
 * sibling dependency.
 */

/** Leaves room for a `-suffix` while staying inside the schema's 80. */
export const MAX_SLUG_BASE_LENGTH = 60;

/**
 * Letters that survive Unicode decomposition intact, so stripping combining
 * marks is not enough. Estonian needs none of these — `ä ö ü õ š ž` all
 * decompose — but a title is free to contain a borrowed word.
 */
const LATIN_LIGATURES: Readonly<Record<string, string>> = {
    ß: "ss",
    ø: "o",
    æ: "ae",
    œ: "oe",
    đ: "d",
    ð: "d",
    þ: "th",
    ł: "l",
    ı: "i"
};

/**
 * Russian, after decomposition — `ё` and `й` have already lost their marks by
 * the time this table is applied, so they map through `е` and `и`.
 */
const CYRILLIC: Readonly<Record<string, string>> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ж: "zh",
    з: "z",
    и: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya"
};

/**
 * Deliberately missing `0`, `1`, `l`, `i` and `o`: these end up in links people
 * read aloud over the phone and copy off a slide.
 */
const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const DEFAULT_TOKEN_LENGTH = 8;
const SUFFIX_LENGTH = 6;
/** `SurveySlugSchema` rejects anything shorter, so a shorter base is no base. */
const MIN_SLUG_LENGTH = 3;

function transliterate(character: string): string {
    return LATIN_LIGATURES[character] ?? CYRILLIC[character] ?? character;
}

/**
 * Truncates without leaving half a word behind. Falls back to a hard cut when
 * the first word is itself longer than the budget.
 */
function truncateAtSeparator(slug: string, limit: number): string {
    if (slug.length <= limit) return slug;
    const cut = slug.slice(0, limit);
    const lastSeparator = cut.lastIndexOf("-");
    return lastSeparator > 0 ? cut.slice(0, lastSeparator) : cut;
}

/**
 * The readable part of a link. Returns `""` when the title is emoji,
 * punctuation or a script with no transliteration here — the caller then falls
 * back to a random token rather than inventing something.
 */
export function slugifyTitle(title: string): string {
    const folded = title
        .toLowerCase()
        // NFD then dropping the combining marks handles every Latin diacritic,
        // which is all of Estonian; the tables above cover the rest.
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .split("")
        .map(transliterate)
        .join("");

    return truncateAtSeparator(
        folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        MAX_SLUG_BASE_LENGTH
    ).replace(/^-+|-+$/g, "");
}

/** A random slug, used whole when a title yields nothing and as a suffix otherwise. */
export function randomSlugToken(length = DEFAULT_TOKEN_LENGTH): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(
        bytes,
        // Modulo bias across 31 symbols out of 256 is immaterial: this is a
        // collision-avoidance token, not a secret.
        byte => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
    ).join("");
}

/**
 * The `attempt`-th candidate slug for a survey being published. Attempt 0 is
 * the bare title; every later attempt appends a fresh suffix, so a caller that
 * loops on unique-violation terminates in practice on the second try.
 */
export function proposeSlug(title: string, attempt: number): string {
    const base = slugifyTitle(title);
    if (base.length < MIN_SLUG_LENGTH) return randomSlugToken();
    if (attempt <= 0) return base;
    return `${base}-${randomSlugToken(SUFFIX_LENGTH)}`;
}
