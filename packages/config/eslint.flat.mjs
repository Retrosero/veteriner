/**
 * @file Paylaşılan ESLint v9 flat-config üreticisi.
 * @module @vetniva/config/eslint-flat
 * @description Legacy kuralları FlatCompat ile korur ve her workspace
 * paketinin kendi tsconfig kökünü açıkça bağlar. Böylece tip-bilinçli
 * kurallar doğru proje üzerinde çalışır; paketler arası gizli çözümleme
 * bağımlılığı oluşmaz.
 * @security `no-floating-promises`, `no-misused-promises` ve güvenlik
 * kuralları klinik/finansal kodda hata sınıfını erken yakalamak için
 * devre dışı bırakılmaz.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const legacyConfig = path.join(dirname, 'eslint.base.cjs');

const compat = new FlatCompat({
  baseDirectory: dirname,
  resolvePluginsRelativeTo: dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

/**
 * Bir TypeScript workspace paketi için ortak lint konfigürasyonunu üretir.
 * @param {{ tsconfigRootDir: string; files?: string[] }} options Paket kapsamı.
 * @returns {import("eslint").Linter.Config[]} ESLint flat config dizisi.
 */
export function createTypeScriptLintConfig({ tsconfigRootDir, files }) {
  return [
    {
      ignores: [
        'node_modules/**',
        'dist/**',
        '.next/**',
        '.turbo/**',
        'coverage/**',
        '**/generated/**',
      ],
    },
    js.configs.recommended,
    ...compat.config({ extends: [legacyConfig] }),
    {
      files: files ?? ['src/**/*.{ts,tsx}', 'test/**/*.ts', 'tests/**/*.ts'],
      languageOptions: {
        parserOptions: {
          project: ['./tsconfig.json', './tsconfig.*.json'],
          tsconfigRootDir,
        },
      },
    },
  ];
}
