/**
 * Sign-in failure codes. They are shared by the Server Action and the callback
 * route handler, and each maps to an `Auth.errors.*` key in the message
 * catalogue — the route handler cannot render copy, so it passes the code back
 * to `/login` in the query string and the page translates it.
 */
export const SIGN_IN_ERRORS = [
    "invalidEmail",
    "rateLimited",
    "sendFailed",
    "linkInvalid",
    "wrongBrowser"
] as const;

export type SignInError = (typeof SIGN_IN_ERRORS)[number];

export function isSignInError(value: unknown): value is SignInError {
    return (
        typeof value === "string" &&
        (SIGN_IN_ERRORS as readonly string[]).includes(value)
    );
}
