/**
 * @file Worker Vitest konfigürasyonu.
 * @module @vetniva/worker/vitest
 *
 * @description Worker paketinin unit test koşucusu. Node ortamında
 * çalışır; test dosyaları src/ ağacının içinde bulunur
 * (`*.spec.ts` ve `*.test.ts`).
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    },
  },
});
