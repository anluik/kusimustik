import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Integration tests against local Supabase — RLS policies, triggers and the
 * repository layer end to end. They need `supabase start` and a database at the
 * current migrations, so they are deliberately not part of `pnpm check`; run
 * them with `pnpm test:db` after touching anything in supabase/ or lib/db/.
 */

const envFile = join(import.meta.dirname, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
        environment: "node",
        include: ["**/*.db.test.ts"],
        exclude: ["node_modules/**", ".next/**", "e2e/**"],
        // Each test owns the users it creates, but they share one database.
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 30_000
    }
});
