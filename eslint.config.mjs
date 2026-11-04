import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Stricter in eslint-plugin-react-hooks 7.1: flags the common
      // "setLoading(true) then fetch" pattern in ~30 effects. Kept as a warning
      // until data fetching moves to a shared hook (ISSUES.md PERF-2 / FEAT-1),
      // which removes these effects rather than rewriting each one.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
