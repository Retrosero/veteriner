import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@vetniva/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: [
      "src/**/*.spec.ts",
      "src/**/*.test.ts",
      "test/**/*.spec.ts",
      "test/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    passWithNoTests: true,
  },
});
