import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".vercel", ".wrangler"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Each context file exports its provider together with the hook that reads it, and the
    // vendored shadcn/ui files export their variants next to the component. Splitting them
    // would only buy fast refresh on files that rarely change; an edit there reloads the page.
    files: ["src/contexts/**/*.tsx", "src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Vitest runs a function returned from beforeEach or beforeAll as cleanup after the test, so
    // `beforeEach(() => mock.mockReset())` calls the mock again with no arguments (ATS-32).
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^before(Each|All)$/] > ArrowFunctionExpression[expression=true]",
          message:
            "Use a block body: `beforeEach(() => { ... })`. Vitest runs a returned function as cleanup.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
