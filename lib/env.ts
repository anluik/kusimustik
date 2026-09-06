import { z } from "zod";

/**
 * The application's own public origin. Explicit rather than derived from the
 * `Host` header: it is what magic-link emails point back at, and a spoofed
 * host would otherwise decide where a sign-in link sends the user.
 */
export function siteUrl(): string {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    if (raw === undefined || raw === "") {
        throw new Error("Missing environment variable NEXT_PUBLIC_SITE_URL");
    }
    return z.url().parse(raw).replace(/\/$/, "");
}
