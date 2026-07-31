/**
 * @file @vetniva/contracts vitest konfigürasyonu.
 * @module @vetniva/contracts/vitest
 *
 * @description TypeScript ESM modüllerini doğrudan `src/`
 * altından yükleyebilmek için `resolve.extensions` ve
 * `server.deps.inline` ayarlanır. Aksi halde `./health.js`
 * gibi importlar `src/health.ts`'i bulamaz.
 *
 * @since GOAL-118 (FAZ-11) pilot temizliği — test çalıştırma düzeltmesi
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".js", ".mjs", ".cjs"],
  },
  server: {
    deps: {
      inline: ["./src/**/*"],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
    },
  },
});
