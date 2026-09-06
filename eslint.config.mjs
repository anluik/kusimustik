import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Turns off the stylistic rules Prettier owns. Must stay last.
    prettier,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        // Generated: Supabase types, shadcn CLI output, CLI scratch state,
        // coverage. `hooks/use-mobile.ts` ships from `shadcn add sidebar` and
        // trips react-hooks/set-state-in-effect; re-running the CLI would undo
        // any repair, so it is ignored rather than edited.
        "lib/db/database.types.ts",
        "hooks/use-mobile.ts",
        "supabase/.temp/**",
        "coverage/**"
    ])
]);

export default eslintConfig;
