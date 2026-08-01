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
    alias: [
      {
        find: "@vetniva/ui/cn",
        replacement: new URL("../../packages/ui/src/cn.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@vetniva/ui",
        replacement: new URL("../../packages/ui/src/index.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@vetniva/i18n",
        replacement: new URL(
          "../../packages/i18n/src/index.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: "@vetniva/contracts",
        replacement: new URL(
          "../../packages/contracts/src/index.ts",
          import.meta.url,
        ).pathname,
      },
      { find: "@", replacement: new URL("./src", import.meta.url).pathname },
      { find: "@app", replacement: new URL("./app", import.meta.url).pathname },
    ],
  },
});
