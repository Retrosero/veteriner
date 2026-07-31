/**
 * @file Doküman-kod uyum denetleyicisi — kök.
 * @module @vetniva/docs-check
 *
 * @description Next.js ve NestJS route'larını tarar; her route için
 * `docs/pages/` veya `docs/api/` altında bir YAML bilgi kaydı olmasını
 * zorunlu kılar. Hata kodları ve permission referansları da doğrulanır.
 *
 * Bu denetleyici CI kapısıdır (`pnpm docs:check`). Eksik kayıt varsa
 * exit code 1 ile çıkar.
 *
 * @security Denetleyici, kodda geçen sabit referansları (hata kodu,
 * permission) okur; bunlar zaten public bilgidir. PII taramaz.
 */

import { run } from "./runner.js";

const root = process.cwd();

run(root).then((result) => {
  // Çıktıyı renkli bas; CI ortamında renksiz düşer.
  const isCI = process.env.CI === "true";
  const red = (s: string): string => (isCI ? s : `\u001b[31m${s}\u001b[0m`);
  const green = (s: string): string => (isCI ? s : `\u001b[32m${s}\u001b[0m`);
  const yellow = (s: string): string => (isCI ? s : `\u001b[33m${s}\u001b[0m`);
  const dim = (s: string): string => (isCI ? s : `\u001b[2m${s}\u001b[0m`);

  process.stdout.write(dim(`\nDoküman-kod uyum denetimi\n${"─".repeat(40)}\n`));
  process.stdout.write(
    `Taranan route sayısı: ${result.scanned.web + result.scanned.api}\n`,
  );
  process.stdout.write(
    `  web: ${result.scanned.web}, api: ${result.scanned.api}\n`,
  );
  process.stdout.write(
    `Hata kodu referansı: ${result.scanned.errorCodesVet} VET-, ${result.scanned.errorCodesLegacy} legacy\n`,
  );
  process.stdout.write(
    `Permission referansı: ${result.scanned.permissions}\n`,
  );
  process.stdout.write(`AI chunk: ${result.scanned.aiChunks}\n`);
  process.stdout.write(
    `Alan referansı: ${result.scanned.fieldRefs} (katalog: ${result.scanned.fieldIds})\n`,
  );
  process.stdout.write(
    `i18n locale: ${result.scanned.i18nLocales} dosya tarandı\n\n`,
  );

  if (result.issues.length === 0) {
    process.stdout.write(green("✓ Tüm kontroller geçti.\n"));
    process.exit(0);
  }

  for (const issue of result.issues) {
    const label =
      issue.severity === "error" ? red("[HATA]") : yellow("[UYARI]");
    process.stdout.write(`${label} ${issue.path} — ${issue.message}\n`);
  }

  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.length - errors;

  process.stdout.write(
    `\n${red(`${errors} hata`)}, ${yellow(`${warnings} uyarı`)}\n`,
  );
  process.exit(errors > 0 ? 1 : 0);
});
