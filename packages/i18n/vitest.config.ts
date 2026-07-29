import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@vetniva/contracts": path.resolve(
        __dirname,
        "../contracts/src/index.ts",
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
