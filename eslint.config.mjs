import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "src/generated/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Allow console.warn/error/log in scripts and server code
    files: ["scripts/**/*.ts", "src/server/**/*.ts"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
    },
  },
]);
