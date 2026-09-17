/**
 * Random identifiers for things that only have to be distinct: a question's
 * key, an option's value. Lowercase letters and digits, so a token fits every
 * schema that holds one.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomToken(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    // Modulo bias across 36 symbols out of 256 is immaterial for a value that
    // only has to be distinct, not secret.
    return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join("");
}
