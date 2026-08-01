/**
 * @file API ESLint flat yapılandırması.
 * @module apps/api/eslint.config
 *
 * @description ESLint v9, legacy `@vetniva/config/eslint` presetini
 * doğrudan okuyamaz. FlatCompat, mevcut ortak kuralları API paketi için
 * flat-config biçimine dönüştürür.
 *
 * @security TypeScript kaynakları için ortak güvenlik, import ve Türkçe
 * JSDoc kuralları CI'da uygulanır; üretilen Prisma dosyaları taranmaz.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const sharedLegacyConfig = path.resolve(
  dirname,
  "../../packages/config/eslint.base.cjs",
);
const compat = new FlatCompat({
  baseDirectory: dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "dist/**",
      ".turbo/**",
      "coverage/**",
      "node_modules/**",
      "prisma/generated/**",
    ],
  },
  ...compat.config({
    extends: [sharedLegacyConfig],
  }),
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir: dirname,
      },
    },
  },
  {
    // In-memory repository'lerde patch anahtarlari controller DTO/Zod sinirinda
    // dogrulanmis dar tiplerden gelir ve record'a yalnizca tenant-scoped
    // repository metotlari icinde uygulanir. security eklentisi bu kontrollu
    // dynamic-key desenini property injection olarak yanlis pozitifler; kural
    // controller, service ve adapter kaynaklarinda calismaya devam eder.
    files: ["src/**/*.repository.ts"],
    rules: {
      "security/detect-object-injection": "off",
    },
  },
  {
    // Bu dosyalardaki regexler para/olcu decimal dilbilgisidir: baslangic ve
    // bitis anchor'lidir, tekrarlanan kesir bolumu en fazla dort hanedir.
    // security eklentisi `+` nedeniyle ReDoS uyarisi verse de bu denetlenmis
    // desenlerde geri izleme patlamasi yoktur. Diger regex kullanimlarinda
    // kural aktif kalir.
    files: [
      "src/common/clinic-sales/clinic-sale.types.ts",
      "src/common/clinical-consumption/clinical-consumption.types.ts",
      "src/common/inventory/inventory.types.ts",
      "src/common/payments/payment-reversal.types.ts",
      "src/common/payments/payment.types.ts",
      "src/common/petshop-sale-returns/petshop-sale-return.types.ts",
      "src/common/petshop-sales/petshop-sale.types.ts",
      "src/common/pricing/pricing.types.ts",
      "src/common/products/product.types.ts",
      "src/common/purchase-orders/purchase-order.types.ts",
      "src/common/stock-alerts/stock-alert.types.ts",
      "src/common/stock-movements/stock-movement.types.ts",
      "src/modules/cash-register/cash-register.service.ts",
      "src/modules/payments/payments.repository.ts",
      "src/modules/payments/payments.service.ts",
      "src/modules/petshop-sale-returns/petshop-sale-returns.service.ts",
      "src/modules/petshop-sales/petshop-sales.service.ts",
    ],
    rules: {
      "security/detect-unsafe-regex": "off",
    },
  },
  {
    // Unit testlerde Vitest mock'ları kasıtlı olarak `async`, type assertion
    // ve method referansı kullanabilir. Bu kurallar production kaynaklarında
    // aynen uygulanır; test davranışını ve gerçek güvenlik kontrollerini
    // gevşetmez.
    files: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "jsdoc/require-description": "off",
    },
  },
];
