/**
 * @file ESLint flat config.
 * @module @vetniva/web/eslint.config
 *
 * @description apps/web için ESLint v9 flat config. @vetniva/config/eslint
 * legacy preset'i FlatCompat üzerinden dahil edilir. Next.js + React +
 * React Hooks kuralları bu katmanda uygulanır.
 *
 * @security Kurallar repository genelinde standarttır; paketin
 * domain hassasiyeti (klinik/finansal) ileride sıkılaştırılabilir.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sharedLegacyConfig = path.resolve(
  __dirname,
  "../../packages/config/eslint.base.cjs",
);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      ".next/**",
      ".turbo/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...compat.config({
    extends: [sharedLegacyConfig],
  }),
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Next.js app dizininde JSX kullanımı yaygın; bu kural esnetilir.
      "no-undef": "off",
      // Testlerde console.error bilinçli kullanılabilir.
      "no-console": ["error", { allow: ["warn", "error"] }],
      // TypeScript zaten tip kontrolü yapıyor; burada çift kontrol istemiyoruz.
      "import/no-default-export": "off",
      // React/JSX ortamında document/window kullanımı normal.
      "no-restricted-globals": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // Next.js, React 17+ otomatik JSX runtime kullanır.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // Proje standardı yalnız public/karmaşık API'lerde JSDoc ister;
      // her yerel React yardımcı fonksiyonuna boş blok eklenmez.
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-description": "off",
      "jsdoc/check-tag-names": "off",
      "jsdoc/check-values": "off",
      "jsdoc/require-description-complete-sentence": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/tag-lines": "off",
      // Güvenlik kuralları uyarı olarak geçilemez; paket kapısında hata üretir.
      "security/detect-object-injection": "error",
      "security/detect-unsafe-regex": "error",
    },
  },
];
