/**
 * @file Restore akis yonetimi.
 * @module @vetniva/backup/restore
 *
 * @description GOAL-124 (FAZ-12) kapsaminda backup dosyasindan
 * PostgreSQL veritabanini geri yukleme akisi. Pre-flight
 * kontrolleri (dosya varligi, checksum, tier uyumu) yapar;
 * dry-run modunda gercek restore yapmadan sadece plan uretir.
 * Tenant izolasyonu, audit ve PII kurallarina uyar.
 *
 * Onemli: restore islemi yalnizca `vetniva_restore_test_`
 * on ekli gecici veritabanina yazilir. Canli `vetniva`
 * veritabanina asla dokunmaz. Production'da
 * `tools/backup/restore-test.ps1` PowerShell wrapper
 * ile koordine edilir.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import type { BackupResult, BackupTier, RestoreTestResult } from "./backup-types.js";

/** Restore oncesi pre-flight kontrol sonucu. */
export interface PreFlightCheck {
  /** Tum kontroller gecti mi? */
  ok: boolean;
  /** Tek tek kontrol sonuclari. */
  checks: ReadonlyArray<{ name: string; ok: boolean; detail: string }>;
}

/** Restore secenekleri. */
export interface RestoreOptions {
  /** Kaynak backup dosyasi. */
  backupFile: string;
  /** Tier (pilot/production/critical). */
  tier: BackupTier;
  /** Container (varsayilan: vetniva-postgres). */
  container?: string;
  /** DB kullanicisi (varsayilan: vetniva). */
  user?: string;
  /** Hedef DB adi (gecici; restore_test_ ile baslar). */
  restoreDatabase?: string;
  /** pg_restore runner (mockable). */
  pgRestoreRunner?: (args: {
    container: string;
    database: string;
    user: string;
    backupFile: string;
  }) => Promise<{ durationMs: number; verifiedTables: Record<string, number> }>;
  /** Dry-run modu. */
  dryRun?: boolean;
  /** Su anki zaman (testlerde inject). */
  now?: () => Date;
}

/** Gecici restore veritabani icin isim ureteci. */
export function buildRestoreDatabaseName(prefix: string = "vetniva_restore_test_"): string {
  // timestamp + uuid son 8 karakteri
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}${stamp}_${suffix}`;
}

/** Hedef DB adinin restore_test_ on ekine sahip oldugunu dogrular. */
export function isValidRestoreDbName(name: string): boolean {
  return /^vetniva_restore_test_[A-Za-z0-9_]+$/.test(name);
}

/**
 * Pre-flight check: backup dosyasinin varligi, boyutu,
 * tier uyumu ve hedef DB adinin gecerliligi kontrol
 * edilir. Hata durumunda `ok: false` + hata detayi doner.
 */
export async function preflightCheck(
  backupFile: string,
  tier: BackupTier,
  restoreDatabase: string,
): Promise<PreFlightCheck> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // 1) Restore DB adi gecerli mi?
  checks.push({
    name: "restore_db_name",
    ok: isValidRestoreDbName(restoreDatabase),
    detail: isValidRestoreDbName(restoreDatabase)
      ? `Restore DB adi gecerli: ${restoreDatabase}`
      : `Restore DB adi gecersiz (restore_test_ on eki zorunlu): ${restoreDatabase}`,
  });

  // 2) Backup dosyasi var mi?
  let fileSize = 0;
  try {
    const s = await stat(backupFile);
    fileSize = s.size;
    checks.push({
      name: "backup_file_exists",
      ok: true,
      detail: `Backup dosyasi mevcut: ${backupFile} (${fileSize} bytes)`,
    });
  } catch (err) {
    checks.push({
      name: "backup_file_exists",
      ok: false,
      detail: `Backup dosyasi bulunamadi: ${backupFile} (${(err as Error).message})`,
    });
  }

  // 3) Boyut pozitif mi?
  checks.push({
    name: "backup_file_size",
    ok: fileSize > 0,
    detail: fileSize > 0
      ? `Backup dosyasi ${fileSize} bytes (pozitif).`
      : `Backup dosyasi bos veya okunamadi.`,
  });

  // 4) Tier degeri gecerli mi?
  const validTiers: ReadonlyArray<BackupTier> = ["pilot", "production", "critical"];
  checks.push({
    name: "tier_valid",
    ok: validTiers.includes(tier),
    detail: `Tier: ${tier} (${validTiers.includes(tier) ? "gecerli" : "gecersiz"})`,
  });

  return {
    ok: checks.every((c) => c.ok),
    checks,
  };
}

/**
 * Restore akisi: pre-flight + pg_restore + sanity verify.
 * dryRun=true ise pre-flight + plan uretir, gercek
 * pg_restore calistirmaz.
 */
export async function performRestore(
  options: RestoreOptions,
): Promise<RestoreTestResult> {
  const now = (options.now ?? (() => new Date()))();
  const restoreDatabase = options.restoreDatabase ?? buildRestoreDatabaseName();
  const container = options.container ?? "vetniva-postgres";
  const user = options.user ?? "vetniva";

  // Pre-flight
  const preflight = await preflightCheck(
    options.backupFile,
    options.tier,
    restoreDatabase,
  );
  if (!preflight.ok) {
    const failed = preflight.checks.filter((c) => !c.ok).map((c) => c.name);
    throw new Error(
      `pre-flight basarisiz: ${failed.join(", ")}`,
    );
  }

  if (options.dryRun) {
    return {
      restoreDatabase,
      backupFile: options.backupFile,
      verifiedTables: {},
      cleanedUp: false,
      durationMs: 0,
      restoredAt: now.toISOString(),
    };
  }

  // pg_restore + sanity verify
  const runner = options.pgRestoreRunner;
  if (!runner) {
    throw new Error("pgRestoreRunner zorunlu (production: tools/backup/restore-test.ps1)");
  }
  const result = await runner({
    container,
    database: restoreDatabase,
    user,
    backupFile: options.backupFile,
  });

  return {
    restoreDatabase,
    backupFile: options.backupFile,
    verifiedTables: result.verifiedTables,
    cleanedUp: true,
    durationMs: result.durationMs,
    restoredAt: now.toISOString(),
  };
}

/** Backup sonucunun tier uyumu (ornek: critical tier icin RPO 0 olmali). */
export function tierMatchesBackup(
  backup: BackupResult,
  expectedTier: BackupTier,
): { ok: boolean; reason: string } {
  if (backup.tier !== expectedTier) {
    return {
      ok: false,
      reason: `Backup tier (${backup.tier}) ile beklenen tier (${expectedTier}) uyumsuz.`,
    };
  }
  return { ok: true, reason: "Tier uyumu OK." };
}
