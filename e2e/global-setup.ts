import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { OWNER_STATE, signInAsOwner } from "./support";

/**
 * Signs the seeded owner in once and saves the session for every owner spec.
 *
 * A magic link is rate limited per address and takes a round trip through
 * Mailpit, so doing it per spec would be both slow and flaky under the two
 * parallel projects. `storageState` is Playwright's answer to exactly this.
 *
 * It runs after `webServer` has come up, which is what makes `baseURL`
 * reachable here at all.
 *
 * The base URL comes from the config rather than being worked out again here.
 * Deriving it twice is what let the two drift onto different hosts, and a
 * sign-in that crosses hosts loses its PKCE verifier cookie — see the comment
 * in playwright.config.ts.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use.baseURL;
    if (baseURL === undefined) {
        throw new Error("globalSetup: no project defines a baseURL");
    }

    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await signInAsOwner(page);
        await mkdir(dirname(OWNER_STATE), { recursive: true });
        await context.storageState({ path: OWNER_STATE });
    } finally {
        await browser.close();
    }
}
