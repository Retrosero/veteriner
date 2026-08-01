/**
 * @file I18n parity denetleyicisi — kök.
 * @module @vetniva/i18n-check
 * @description Packages/i18n/src/locales/ altındaki tr-TR ve en-GB
 * dosyalarını karşılaştırır. GOAL-000 kapsamında yalnızca tr-TR
 * anahtarları zorunludur; en-GB eksik olan anahtarlar warning seviyesinde
 * raporlanır. Faz 14'te en-GB parity zorunlu hale getirilir.
 */

import { run } from "./runner.js";

const root = process.cwd();

/** I18n parity sonucunu CLI çıkış koduna dönüştürür. */
async function main(): Promise<void> {
  const result = await run(root);
  if (result.issues.length === 0) {
    process.stdout.write("✓ i18n parity temiz.\n");
    return;
  }
  for (const issue of result.issues) {
    const label = issue.severity === "error" ? "[HATA]" : "[UYARI]";
    process.stdout.write(`${label} ${issue.path} — ${issue.message}\n`);
  }
  const errors = result.issues.filter((i) => i.severity === "error").length;
  process.exitCode = errors > 0 ? 1 : 0;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `i18n parity denetimi beklenmedik biçimde sonlandı: ${message}\n`,
  );
  process.exitCode = 1;
});
