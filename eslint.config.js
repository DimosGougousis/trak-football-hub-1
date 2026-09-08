import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config({ ignores: ["dist"] }, {
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
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": "off",
    // Downgraded to warn — will be resolved in future TypeScript strictness pass
    "@typescript-eslint/no-explicit-any": "warn",
    // Empty interfaces are common with Supabase generated types
    "@typescript-eslint/no-empty-object-type": "warn",
    // tailwind.config.ts uses require() for plugins — acceptable
    "@typescript-eslint/no-require-imports": "warn",
  },
}, {
  // The use-case harness binds each test suite to a registry entry with
  // useCase('UC-XXX', ...). The `use` prefix makes the react-hooks plugin
  // treat it as a React Hook, but it is a describe() wrapper — it is called
  // at module top level by design and never inside a component.
  files: ["tests/**/*.{ts,tsx}"],
  rules: {
    "react-hooks/rules-of-hooks": "off",
  },
});
