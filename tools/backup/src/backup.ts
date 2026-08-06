/**
 * @file Backup cekirdek motoru.
 * @module @vetniva/backup/backup
 *
 * @description GOAL-124 (FAZ-12) kapsaminda PostgreSQL
 * `pg_dump` + object storage upload yapan cekirdek motor.
 * Tier-aware (pilot/production/critical) yedekleme yapar;
 * timestamp + retention politikasini uygular; AES-256
 * at-rest sifrelemeyi isaretler. Tenant izolasyonu, audit
 * ve PII kurallarina uyar.
 *
 * Akis:
 *   1. Tier (pilot/production/critical) secilir.
 *   2. `pg_dump -Fc` ile custom-format dump alinir.
 *   3. SHA-256 checksum hesaplanir (verify.ts ile birlikte).
 *   4. Upload backend (S3/Azure) secilir; cold storage
 *      isaretlenirse Glacier/Cool tier hedefi.
 *   5. Retention policy: daily/weekly/monthly sayilari
 *      tier matrisinden okunur; eskiyen yedekler
 *      backend'in lifecycle policy'si ile silinir.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

import { createHash, randomUUID } from "node:crypto";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  RPO_RTO_TIERS,
  type BackupRequest,
  type BackupResult,
  type BackupTier,
} from "./backup-types.js";

/** Upload backend secenekleri. */
export type UploadBackend = "s3" | "azure-blob" | "local-fs";

/** Cold storage tier (maliyet optimizasyonu). */
export type ColdStorageTier = "hot" | "glacier" | "cool" | "none";

/** Upload hedef konfigurasyonu. */
export interface UploadTarget {
  /** Backend secimi. */
  backend: UploadBackend;
  /** Bucket veya container adi. */
  bucket: string;
  /** Object key prefix (orn. `backups/pilot/2026/`). */
  prefix: string;
  /** Cold storage tier (hot/glacier/cool/none). */
  coldTier: ColdStorageTier;
  /** Encryption (AES-256 at-rest). */
  encryption: "aes-256" | "none";
  /** SSE algoritmasi (S3 SSE-S3 / SSE-KMS). */
  sseAlgorithm?: "AES256" | "aws:kms";
}

/** Backup alirken kullanilan secenekler. */
export interface PerformBackupOptions {
  /** Yerel dump dosyasinin yazilacagi dizin. */
  outputDirectory: string;
  /** Upload hedef konfigurasyonu. */
  upload?: UploadTarget;
  /** Custom uploader implementasyonu (testlerde mock). */
  uploader?: (target: UploadTarget, localPath: string, key: string) => Promise<{ key: string; bytes: number }>;
  /** Dry-run: dump alinmaz, sadece plan uretilir. */
  dryRun?: boolean;
  /** Su anki zaman (testlerde inject). */
  now?: () => Date;
  /** Container ismi (varsayilan: vetniva-postgres). */
  container?: string;
  /** DB kullanicisi (varsayilan: vetniva). */
  user?: string;
}

/** Backup plan (dry-run sonucu). */
export interface BackupPlan {
  tier: BackupTier;
  database: string;
  outputFile: string;
  expectedSize: number;
  upload?: { backend: UploadBackend; key: string; bucket: string; coldTier: ColdStorageTier };
  retention: { daily: number; weekly: number; monthly: number };
  rpoMinutes: number;
  rtoMinutes: number;
  dryRun: true;
}

/** pg_dump cikti dosyasinin SHA-256 checksum'i. */
export async function computeChecksum(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/** Tier icin dosya yolunu uretir (timestamp + database ad). */
export function buildBackupFileName(
  database: string,
  now: Date,
  extension: string = "dump",
): string {
  const ts = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `${database}-${ts}.${extension}`;
}

/** Tier icin object key uretir (prefix/yyyy/mm/dd/<filename>). */
export function buildObjectKey(
  prefix: string,
  database: string,
  now: Date,
  filename: string,
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${prefix.replace(/\/$/, "")}/${database}/${year}/${month}/${day}/${filename}`;
}

/** Tier bazinda retention bilgisi. */
export interface RetentionSpec {
  daily: number;
  weekly: number;
  monthly: number;
  coldStorage: ColdStorageTier;
  coldStorageDays: number;
}

/** Tier bazinda retention spec uretir. */
export function retentionForTier(tier: BackupTier, coldTier: ColdStorageTier): RetentionSpec {
  const cfg = RPO_RTO_TIERS[tier];
  return {
    daily: cfg.retentionDaily,
    weekly: cfg.retentionWeekly,
    monthly: cfg.retentionMonthly,
    coldStorage: coldTier,
    coldStorageDays: coldTier === "glacier" ? 90 : coldTier === "cool" ? 30 : 0,
  };
}

/** Default pg_dump exec wrapper (mockable). */
export type PgDumpRunner = (args: {
  container: string;
  database: string;
  user: string;
  outputFile: string;
}) => Promise<{ bytes: number }>;

/** Varsayilan pg_dump runner. */
export const defaultPgDumpRunner: PgDumpRunner = async ({
  container,
  database,
  user,
  outputFile,
}) => {
  // PowerShell scripti cagirarak docker exec pg_dump yapar.
  // Burada sadece bytes sayisini uretir; gercek implementasyon
  // production'da `tools/backup/backup-postgres.ps1` ile
  // koordine edilir. Mockable oldugu icin test ortaminda
  // gercek Docker'a baglanmaya gerek yok.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileP = promisify(execFile);

  // Container icinde pg_dump uretiyor; bu davranis core'u
  // dogrulamak icin yapay olarak yazildi. Production'da
  // PowerShell wrapper daha kapsamli (Bkz. backup-postgres.ps1).
  // Burada hata durumunda exception firlatir.
  try {
    await execFileP("docker", [
      "exec",
      container,
      "pg_dump",
      "-U",
      user,
      "-Fc",
      "-d",
      database,
      "-f",
      outputFile,
    ]);
  } catch (err) {
    throw new Error(
      `pg_dump basarisiz: ${(err as Error).message}; container=${container} db=${database}`,
    );
  }

  try {
    const s = await stat(outputFile);
    return { bytes: s.size };
  } catch {
    return { bytes: 0 };
  }
};

/**
 * Backup plan uretir (dry-run). Gercek dump almaz, sadece
 * uretilecek dosyanin adini, hedefini, retention bilgisini
 * ve RPO/RTO degerlerini iceren bir plan doner.
 */
export function planBackup(
  request: BackupRequest,
  now: Date,
  upload?: UploadTarget,
): BackupPlan {
  const filename = buildBackupFileName(request.database, now);
  const outDir = request.outputDirectory;
  const cfg = RPO_RTO_TIERS[request.tier];
  const retention = retentionForTier(request.tier, upload?.coldTier ?? "none");

  const plan: BackupPlan = {
    tier: request.tier,
    database: request.database,
    outputFile: join(outDir, filename),
    expectedSize: 0,
    retention: {
      daily: retention.daily,
      weekly: retention.weekly,
      monthly: retention.monthly,
    },
    rpoMinutes: cfg.rpoMinutes,
    rtoMinutes: cfg.rtoMinutes,
    dryRun: true,
  };

  if (upload) {
    plan.upload = {
      backend: upload.backend,
      key: buildObjectKey(upload.prefix, request.database, now, filename),
      bucket: upload.bucket,
      coldTier: upload.coldTier,
    };
  }

  return plan;
}

/**
 * Backup alir: pg_dump + checksum + upload. dryRun=true
 * ise gercek dump alinmaz, sadece plan uretilir.
 *
 * @param request  Backup gorev tanimi
 * @param options  PerformBackup secenekleri
 * @returns BackupResult
 */
export async function performBackup(
  request: BackupRequest,
  options: PerformBackupOptions,
): Promise<BackupResult> {
  const now = (options.now ?? (() => new Date()))();
  const filename = buildBackupFileName(request.database, now);
  const outputFile = join(options.outputDirectory, filename);
  const cfg = RPO_RTO_TIERS[request.tier];

  if (options.dryRun) {
    const plan = planBackup(request, now, options.upload);
    return {
      backupFile: plan.outputFile,
      bytes: 0,
      database: request.database,
      tier: request.tier,
      encrypted: request.encryption === "aes-256",
      createdAt: now.toISOString(),
    };
  }

  // pg_dump calistir
  const runner = defaultPgDumpRunner;
  const result = await runner({
    container: options.container ?? "vetniva-postgres",
    database: request.database,
    user: request.user ?? "vetniva",
    outputFile,
  });

  // SHA-256 checksum
  const checksum = await computeChecksum(outputFile);

  // Metadata yaz (checksum + tier + retention)
  const metaPath = `${outputFile}.meta.json`;
  const metadata = {
    backupId: `bkp-${randomUUID()}`,
    database: request.database,
    tier: request.tier,
    bytes: result.bytes,
    checksum,
    rpoMinutes: cfg.rpoMinutes,
    rtoMinutes: cfg.rtoMinutes,
    retentionDaily: cfg.retentionDaily,
    retentionWeekly: cfg.retentionWeekly,
    retentionMonthly: cfg.retentionMonthly,
    encrypted: request.encryption === "aes-256",
    archiveStorage: request.archiveStorage,
    createdAt: now.toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");

  // Upload (S3/Azure)
  let uploadedKey: string | undefined;
  if (options.upload && options.uploader) {
    const key = buildObjectKey(
      options.upload.prefix,
      request.database,
      now,
      filename,
    );
    const up = await options.uploader(options.upload, outputFile, key);
    uploadedKey = up.key;
  }

  return {
    backupFile: outputFile,
    bytes: result.bytes,
    database: request.database,
    tier: request.tier,
    encrypted: request.encryption === "aes-256",
    createdAt: now.toISOString(),
    ...(uploadedKey ? { uploadedKey } : {}),
  };
}
