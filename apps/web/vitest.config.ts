/**
 * @file Vitest yapılandırması.
 * @module @vetniva/web/vitest.config
 *
 * @description apps/web için component test ortamı. jsdom + Testing Library
 * kullanılır; testler app ve src dizinlerinde `*.test.{ts,tsx}` olarak
 * yer alır.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["app/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    reporters: ["default"],
    css: false,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@app": new URL("./app", import.meta.url).pathname,
      "@vetniva/contracts": new URL(
        "../../packages/contracts/src/index.ts",
        import.meta.url,
      ).pathname,
      "@vetniva/i18n": new URL(
        "../../packages/i18n/src/index.ts",
        import.meta.url,
      ).pathname,
      "@vetniva/ui": new URL("../../packages/ui/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
