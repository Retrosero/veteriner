#!/usr/bin/env node
/**
 * @file Backup + restore dry-run.
 * @module @vetniva/backup/dry-run
 * @description GOAL-124 kapsaminda tier-aware backup/restore
 *   dry-run araci. Gercek dump almaz; plan uretimi, tier
 *   matris dogrulamasi ve retention/encryption metadata'sini
 *   raporlar. Uretim ortaminda gercek kosu icin
 *   `tools/backup/backup-postgres.ps1` kullanilir.
 * @since 2026-08-06
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  RPO_RTO_TIERS,
  rpoRtoForTier,
  type BackupRequest,
  type BackupTier,
} from "./backup-types.js";
import { planBackup, retentionForTier, type UploadTarget } from "./backup.js";

const here = dirname(process.argv[1] ?? ".");
const repo = resolve(here, "..", "..", "..");
const reportDir = join(repo, "goals", "GOAL-124-archive");
const now = new Date("2026-08-06T12:00:00.000Z");

const tiers = [
  "pilot",
  "production",
  "critical",
] as const satisfies readonly BackupTier[];

function uploadFor(tier: BackupTier): UploadTarget {
  if (tier === "critical") {
    return {
      backend: "s3",
      bucket: "vetniva-critical-backups",
      prefix: "backups/critical/",
      coldTier: "glacier",
      encryption: "aes-256",
      sseAlgorithm: "AES256",
    };
  }
  if (tier === "production") {
    return {
      backend: "s3",
      bucket: "vetniva-prod-backups",
      prefix: "backups/production/",
      coldTier: "cool",
      encryption: "aes-256",
      sseAlgorithm: "AES256",
    };
  }
  return {
    backend: "s3",
    bucket: "vetniva-pilot-backups",
    prefix: "backups/pilot/",
    coldTier: "none",
    encryption: "aes-256",
    sseAlgorithm: "AES256",
  };
}

interface TierReport {
  tier: BackupTier;
  outputFile: string;
  objectKey: string | null;
  rpoMinutes: number;
  rtoMinutes: number;
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
    coldDays: number;
  };
  config: { backend: string; encryption: string; coldTier: string };
}

const reports: TierReport[] = [];

for (const tier of tiers) {
  const upload = uploadFor(tier);
  const request: BackupRequest = {
    tier,
    database: "vetniva",
    outputDirectory: join(reportDir, tier),
    container: "vetniva-postgres",
    user: "vetniva",
    encryption: "aes-256",
    archiveStorage: upload.coldTier === "none" ? "hot" : "cold",
  };
  const plan = planBackup(request, now, upload);
  const retention = retentionForTier(tier, upload.coldTier);
  const tierCfg = RPO_RTO_TIERS[tier];

  reports.push({
    tier,
    outputFile: plan.outputFile,
    objectKey: plan.upload?.key ?? null,
    rpoMinutes: tierCfg.rpoMinutes,
    rtoMinutes: tierCfg.rtoMinutes,
    retention: {
      daily: retention.daily,
      weekly: retention.weekly,
      monthly: retention.monthly,
      coldDays: retention.coldStorageDays,
    },
    config: {
      backend: upload.backend,
      encryption: upload.encryption,
      coldTier: upload.coldTier,
    },
  });
}

const validationIssues: string[] = [];
for (const tier of tiers) {
  const cfg = RPO_RTO_TIERS[tier];
  if (cfg.rpoMinutes < 0) validationIssues.push(`${tier}: RPO negatif`);
  if (cfg.rtoMinutes <= 0) validationIssues.push(`${tier}: RTO pozitif olmali`);
  if (cfg.rpoMinutes > cfg.rtoMinutes) {
    validationIssues.push(
      `${tier}: RPO (${cfg.rpoMinutes}) > RTO (${cfg.rtoMinutes})`,
    );
  }
  if (cfg.retentionDaily < 7)
    validationIssues.push(`${tier}: daily retention < 7`);
  if (cfg.retentionWeekly < 4)
    validationIssues.push(`${tier}: weekly retention < 4`);
  if (cfg.retentionMonthly < 12)
    validationIssues.push(`${tier}: monthly retention < 12`);
}
if (RPO_RTO_TIERS.critical.rpoMinutes !== 0) {
  validationIssues.push("Critical RPO 0 olmali (KVKK/UK GDPR)");
}

const out = {
  dryRunAt: now.toISOString(),
  environment: "local-validation",
  purpose:
    "GOAL-124 backup/restore dry-run: gercek dump alinmadi, plan + tier matris + retention dogrulamasi yapildi.",
  tiers: reports,
  tierMatrixSummary: tiers.map((t) => rpoRtoForTier(t)),
  validation: {
    issues: validationIssues,
    allOk: validationIssues.length === 0,
  },
  followups: [
    "Production dry-run icin: tools/backup/backup-postgres.ps1 + restore-test.ps1 (Coolify postgres'a Docker uzerinden).",
    "S3/Azure upload backend: FAZ-13+ kapsaminda (Phase 13 haric).",
    "WORM storage: FAZ-13+ (KVKK audit log).",
    "WAL streaming: pilot tier icin 5dk hedefi izlenmeli.",
  ],
};

await mkdir(reportDir, { recursive: true });
const reportFile = join(
  reportDir,
  `dry-run-${now.toISOString().slice(0, 10)}.json`,
);
await writeFile(reportFile, JSON.stringify(out, null, 2), "utf8");

const upperTier = (t: BackupTier): string => t.toUpperCase();
const lines: string[] = [
  "=== GOAL-124 BACKUP/RESTORE DRY-RUN ===",
  `Tarih: ${now.toISOString()}`,
  `Tier matris dogrulamasi: ${validationIssues.length === 0 ? "OK" : "BASARISIZ"}`,
  `Issues: ${validationIssues.length}`,
  "",
];
for (const t of reports) {
  lines.push(`--- ${upperTier(t.tier)} ---`);
  lines.push(`  RPO/RTO: ${t.rpoMinutes}dk / ${t.rtoMinutes}dk`);
  lines.push(
    `  Upload: ${t.config.backend} (${t.config.encryption}, cold=${t.config.coldTier})`,
  );
  lines.push(`  Output: ${t.outputFile}`);
  lines.push(`  Object key: ${t.objectKey ?? "(local only)"}`);
  lines.push(
    `  Retention: ${t.retention.daily} daily, ${t.retention.weekly} weekly, ${t.retention.monthly} monthly`,
  );
  lines.push(
    `  Cold storage: ${t.config.coldTier} (${t.retention.coldDays} gunden sonra)`,
  );
  lines.push("");
}
lines.push(`Rapor: ${reportFile}`);
process.stdout.write(lines.join("\n") + "\n");
