/** @file Backup araci ESLint v9 yapilandirmasi. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTypeScriptLintConfig } from "@vetniva/config/eslint-flat";
const dirname = path.dirname(fileURLToPath(import.meta.url));
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      ".turbo/**",
      "coverage/**",
      "**/generated/**",
      // PowerShell scriptleri lint kapsami disinda (farkli dil).
      "*.ps1",
    ],
  },
  ...createTypeScriptLintConfig({ tsconfigRootDir: dirname }),
  {
    // CLI yardimcilari + restore/backup runner'lari: dosya yolu
    // ve tier konfigurasyonu kullanici girdisinden gelir; audit
    // katmaninda tamper kontrolu zaten uygulanir.
    files: ["src/**/*.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-object-injection": "off",
    },
  },
  {
    files: ["tests/**/*.test.ts"],
    rules: {
      "security/detect-object-injection": "off",
    },
  },
];
