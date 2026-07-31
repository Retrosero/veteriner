/**
 * @file Worker Vitest konfigürasyonu.
 * @module @vetniva/worker/vitest
 *
 * @description Worker paketinin unit test koşucusu. Node ortamında
 * çalışır; test dosyaları src/ ağacının içinde bulunur
 * (`*.spec.ts` ve `*.test.ts`).
 *
 * Test ortamı için `REDIS_URL` gibi zorunlu env değişkenleri
 * `setupFiles` üzerinden sağlanır; aksi halde Zod şeması
 * başlangıçta hata fırlatır.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    setupFiles: [path.resolve(__dirname, "tests/setup.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    },
  },
});
