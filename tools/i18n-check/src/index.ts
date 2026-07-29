/**
 * @file i18n parity denetleyicisi — kök.
 * @module @vetniva/i18n-check
 *
 * @description packages/i18n/src/locales/ altındaki tr-TR ve en-GB
 * dosyalarını karşılaştırır. GOAL-000 kapsamında yalnızca tr-TR
 * anahtarları zorunludur; en-GB eksik olan anahtarlar warning seviyesinde
 * raporlanır. Faz 14'te en-GB parity zorunlu hale getirilir.
 */

import { run } from "./runner.js";

const root = process.cwd();

run(root).then((result) => {
  if (result.issues.length === 0) {
    process.stdout.write("✓ i18n parity temiz.\n");
    process.exit(0);
  }
  for (const issue of result.issues) {
    const label = issue.severity === "error" ? "[HATA]" : "[UYARI]";
    process.stdout.write(`${label} ${issue.path} — ${issue.message}\n`);
  }
  const errors = result.issues.filter((i) => i.severity === "error").length;
  process.exit(errors > 0 ? 1 : 0);
});
