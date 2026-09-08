import { chromium } from "@playwright/test";
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
 */
export default async function globalSetup(): Promise<void> {
    const baseURL =
        process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000";

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
