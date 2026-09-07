import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The runner spec checks that a submission actually reached the database, so
// the run needs the same Supabase credentials `next dev` is using. Resolved
// from the working directory rather than `import.meta`: Playwright loads this
// config as CommonJS.
const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const baseURL = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./e2e",
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
