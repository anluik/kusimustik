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
        // Generated: Supabase types, CLI scratch state, coverage output.
        "lib/db/database.types.ts",
        "supabase/.temp/**",
        "coverage/**"
    ])
]);

export default eslintConfig;
