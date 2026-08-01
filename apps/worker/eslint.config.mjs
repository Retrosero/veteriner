/**
 * @file Worker ESLint flat config.
 * @module @vetniva/worker/eslint
 *
 * @description Worker paketi için ESLint v9 flat config. Kurallar
 * `@vetniva/config/eslint.base.cjs` legacy preset'inin flat config
 * karşılığıdır. Burada doğrudan yazılır; tek doğruluk kaynağı olması
 * için repo seviyesinde flat config geçişi tamamlandığında burası
 * sadeleştirilecektir.
 *
 * @security `no-console` kuralı sadece pino üzerinden loglama yapılması
 * için zorunludur. İşlem kuralı: console.log/debug/info yasak; sadece
 * pino JSON veya pretty-print log kullanılır.
 */

import js from "@eslint/js";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".turbo/**",
      "coverage/**",
      "**/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: configDirectory,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Klinik/finansal kod: any kullanımı yasak. İstisna + yorum gerekir.
      "@typescript-eslint/no-explicit-any": "error",
      // Public API metodlarda return type zorunlu.
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      // Kullanılmayan değişkenler hata; _ ile başlayanlar istisna.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Type import'ları inline tercih edilir.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // Promise hataları: unhandled ve misuse engellenir.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // console.* yasak; pino zorunlu.
      "no-console": ["error", { allow: ["warn", "error"] }],
      // process.exit yasak (graceful shutdown main.ts'de yönetilir).
      "no-process-exit": "error",
    },
  },
  {
    // Test dosyaları: aynı kurallar, no-console zaten var.
    files: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    rules: {},
  },
  {
    files: ["src/main.ts"],
    rules: {
      "no-process-exit": "off",
    },
  },
);
