/**
 * @file API smoke E2E Vitest yapılandırması.
 * @module apps/api/vitest.e2e.config
 * @description Veritabanı kullanan HTTP smoke testlerini birim testlerden
 * ayırır. Böylece `pnpm test` yalnızca unit/integration kapsamını, `pnpm
 * e2e:smoke` ise izole PostgreSQL gerektiren uçtan uca kapsamı çalıştırır.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@vetniva/contracts": path.resolve(
        dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    environment: "node",
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    passWithNoTests: false,
  },
});
