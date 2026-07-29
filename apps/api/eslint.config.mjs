/**
 * apps/api ESLint flat config.
 * packages/config/eslint.base.cjs presetini tüketir.
 */
import base from "@vetniva/config/eslint";

export default [
  {
    ignores: ["dist/**", ".turbo/**", "coverage/**", "prisma/generated/**"],
  },
  base,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
