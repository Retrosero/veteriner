/** @file Contracts paketi ESLint v9 yapılandırması. */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createTypeScriptLintConfig } from "@vetniva/config/eslint-flat";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const config = createTypeScriptLintConfig({ tsconfigRootDir: dirname });

export default [
  {
    ignores: ["src/**/*.js", "src/**/*.d.ts", "src/**/*.map"],
  },
  ...config,
];
