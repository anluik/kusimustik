import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The runner spec checks that a submission actually reached the database, so
// the run needs the same Supabase credentials `next dev` is using. Resolved
// from the working directory rather than `import.meta`: Playwright loads this
// config as CommonJS.
const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The magic link points wherever `NEXT_PUBLIC_SITE_URL` says (lib/env.ts), and
// the PKCE verifier is a cookie on the host that asked for the link. Cookies
// are keyed by host and `localhost` is not `127.0.0.1`, so a run that browses
// one and follows a link to the other loses the verifier and the callback
// answers `?error=wrongBrowser` — correctly. Deriving the base URL from the
// same variable is what keeps the two on one origin.
const baseURL =
    process.env["PLAYWRIGHT_BASE_URL"] ??
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    "http://127.0.0.1:3000";

export default defineConfig({
    testDir: "./e2e",
    // Visiting the seeded runner emits interaction events, and the db suite
    // asserts wave one has none. Cleared once at the end rather than per spec,
    // because the projects run in parallel — see e2e/support.ts.
    // Signs the owner in once; owner specs pick the session up through
    // `storageState`. See e2e/global-setup.ts.
    globalSetup: "./e2e/global-setup.ts",
    globalTeardown: "./e2e/global-teardown.ts",
    fullyParallel: true,
    forbidOnly: !!process.env["CI"],
    retries: process.env["CI"] ? 2 : 0,
    reporter: "list",
    use: {
        baseURL,
        trace: "on-first-retry"
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        // DESIGN.md §4: the runner is thumb-first and mobile is the priority
        // surface, so the Phase 6 e2e run has to cover a phone viewport.
        { name: "mobile-safari", use: { ...devices["iPhone 14"] } }
    ],
    webServer: {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env["CI"]
    }
});
