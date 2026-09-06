import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    // Resolves the "@/*" alias from tsconfig.json natively.
    resolve: { tsconfigPaths: true },
    test: {
        environment: "jsdom",
        include: ["**/*.test.{ts,tsx}"],
        // e2e/ belongs to Playwright; .next and supabase/ hold generated
        // output; *.db.test.ts needs a running database, see vitest.config.db.mts.
        exclude: [
            "node_modules/**",
            ".next/**",
            "e2e/**",
            "supabase/**",
            "**/*.db.test.ts"
        ]
    }
});
