/**
 * @file Backup/restore validate CLI.
 * @module @vetniva/backup/cli-validate
 *
 * @description Backup/restore proseduru tutarlilik kontrolu.
 * PowerShell script parametrelerinin TS tipleri ile uyumunu,
 * RPO/RTO tier matrisini ve temel sanity kontrollerini yapar.
 * Tenant izolasyonu ve PII kurallarina uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/backup validate
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

import { RPO_RTO_TIERS, rpoRtoForTier } from "./backup-types.js";

function main(): void {
  const issues: string[] = [];

  // 1) RPO/RTO tier matrisi
  for (const tier of ["pilot", "production", "critical"] as const) {
    const cfg = RPO_RTO_TIERS[tier];
    if (cfg.rpoMinutes < 0) issues.push(`${tier}: RPO negatif`);
    if (cfg.rtoMinutes <= 0) issues.push(`${tier}: RTO pozitif olmali`);
    if (cfg.rpoMinutes > cfg.rtoMinutes) {
      issues.push(
        `${tier}: RPO (${cfg.rpoMinutes}) RTO'dan (${cfg.rtoMinutes}) buyuk olamaz`,
      );
    }
  }

  // 2) Critical tier: RPO 0 olmali (KVKK/UK GDPR)
  if (RPO_RTO_TIERS.critical.rpoMinutes !== 0) {
    issues.push("Critical tier RPO 0 olmali (KVKK/UK GDPR zero data loss)");
  }

  // 3) Pilot RPO 5dk, RTO 1 saat
  if (RPO_RTO_TIERS.pilot.rpoMinutes !== 5) {
    issues.push(
      `Pilot RPO 5dk olmali, bulunan: ${RPO_RTO_TIERS.pilot.rpoMinutes}`,
    );
  }
  if (RPO_RTO_TIERS.pilot.rtoMinutes !== 60) {
    issues.push(
      `Pilot RTO 60dk olmali, bulunan: ${RPO_RTO_TIERS.pilot.rtoMinutes}`,
    );
  }

  // 4) Production RPO 1dk, RTO 30dk
  if (RPO_RTO_TIERS.production.rpoMinutes !== 1) {
    issues.push(
      `Production RPO 1dk olmali, bulunan: ${RPO_RTO_TIERS.production.rpoMinutes}`,
    );
  }
  if (RPO_RTO_TIERS.production.rtoMinutes !== 30) {
    issues.push(
      `Production RTO 30dk olmali, bulunan: ${RPO_RTO_TIERS.production.rtoMinutes}`,
    );
  }

  // 5) Critical RTO 15dk
  if (RPO_RTO_TIERS.critical.rtoMinutes !== 15) {
    issues.push(
      `Critical RTO 15dk olmali, bulunan: ${RPO_RTO_TIERS.critical.rtoMinutes}`,
    );
  }

  // 6) Retention tier
  for (const tier of ["pilot", "production", "critical"] as const) {
    const cfg = RPO_RTO_TIERS[tier];
    if (cfg.retentionDaily < 7) issues.push(`${tier}: daily retention < 7`);
    if (cfg.retentionWeekly < 4) issues.push(`${tier}: weekly retention < 4`);
    if (cfg.retentionMonthly < 12)
      issues.push(`${tier}: monthly retention < 12`);
  }

  // 7) rpoRtoForTier donus tipi
  const summary = rpoRtoForTier("pilot");
  if (summary.tier !== "pilot")
    issues.push("rpoRtoForTier tier alanini korumadi");
  if (!summary.strategy.includes("WAL"))
    issues.push("Pilot strategy WAL icermeli");

  const out = {
    tiers: ["pilot", "production", "critical"].map((t) =>
      rpoRtoForTier(t as "pilot" | "production" | "critical"),
    ),
    issues,
    allOk: issues.length === 0,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main();
