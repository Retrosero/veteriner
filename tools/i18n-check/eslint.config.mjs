/** @file i18n-check aracı ESLint v9 yapılandırması. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTypeScriptLintConfig } from "@vetniva/config/eslint-flat";
const dirname = path.dirname(fileURLToPath(import.meta.url));
export default createTypeScriptLintConfig({ tsconfigRootDir: dirname });
