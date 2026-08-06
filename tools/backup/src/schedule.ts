/**
 * @file Backup zamanlama (cron) yonetimi.
 * @module @vetniva/backup/schedule
 *
 * @description GOAL-124 (FAZ-12) kapsaminda backup job
 * zamanlamasi. Tier bazinda cron expression uretir;
 * BACKUP_CRON env override eder; sonraki calisma zamanini
 * hesaplar. Tenant izolasyonu, audit ve PII kurallarina uyar.
 *
 * Not: Bu modul sadece zamanlama metadata'sini uretir.
 * Gercek scheduler (cron, k8s CronJob, vb.) production'da
 * ayri konfigure edilir; bu modul hem PowerShell
 * `backup-postgres.ps1` hem de TypeScript CLI tarafindan
 * okunabilir.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

import type { BackupTier } from "./backup-types.js";

/** Tier bazinda varsayilan cron expression. */
export const DEFAULT_CRON: Readonly<Record<BackupTier, string>> = {
  pilot: "0 3 * * *", // Gunluk 03:00 UTC
  production: "0 2 * * *", // Gunluk 02:00 UTC (daha erken)
  critical: "*/15 * * * *", // Her 15 dakika (replika + WAL)
};

/** Tier bazinda WAL streaming sikligi. */
export const DEFAULT_WAL_CRON: Readonly<Record<BackupTier, string>> = {
  pilot: "*/5 * * * *", // Her 5 dakika
  production: "*/1 * * * *", // Her dakika
  critical: "*/1 * * * *", // Her dakika (sync)
};

/** Zamanlama konfigurasyonu. */
export interface ScheduleConfig {
  /** Tier (pilot/production/critical). */
  tier: BackupTier;
  /** Cron expression (override edilebilir). */
  cron: string;
  /** WAL streaming cron expression. */
  walCron: string;
  /** Backup zamanlama aciklamasi. */
  description: string;
}

/** Env variable adlari. */
export const ENV_VARS = {
  BACKUP_CRON: "BACKUP_CRON",
  BACKUP_WAL_CRON: "BACKUP_WAL_CRON",
  BACKUP_TIER: "BACKUP_TIER",
  BACKUP_TIMEZONE: "BACKUP_TIMEZONE",
} as const;

/**
 * Tier icin zamanlama konfigurasyonu uretir. Env
 * variable'lari (BACKUP_CRON, BACKUP_WAL_CRON) override
 * edebilir; aksi halde tier varsayilani kullanilir.
 */
export function buildSchedule(
  tier: BackupTier,
  env: NodeJS.ProcessEnv = process.env,
): ScheduleConfig {
  const cron = env[ENV_VARS.BACKUP_CRON] || DEFAULT_CRON[tier];
  const walCron = env[ENV_VARS.BACKUP_WAL_CRON] || DEFAULT_WAL_CRON[tier];
  return {
    tier,
    cron,
    walCron,
    description: tierDescription(tier, cron, walCron),
  };
}

function tierDescription(tier: BackupTier, cron: string, walCron: string): string {
  switch (tier) {
    case "pilot":
      return `Pilot tier: tam yedek (${cron}) + 5dk WAL streaming (${walCron}).`;
    case "production":
      return `Production tier: tam yedek (${cron}) + 1dk WAL streaming (${walCron}) + standby.`;
    case "critical":
      return `Critical tier: sik replika (${cron}) + 1dk WAL streaming (${walCron}) + multi-region.`;
  }
}

/** Cron expression 5 alan geldigini dogrular (dakika, saat, gun, ay, haftanin gunu). */
export function isValidCron(expr: string): boolean {
  if (typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Genel syntax kontrolu: *, sayi, step (*/n), range (a-b), liste (a,b,c).
  // ReDoS acisindan güvenli: tamamen anchored, tek-rakamli ve sinirli
  // tekrar; cron field uzunlugu 1-2 karakter, false positive.
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored cron field validator, bounded alternation
  const cronFieldRe = /^(\*|(\*\/\d+)|(\d+(-(\d+))?)(,(\d+(-(\d+))?))*)$/;
  return parts.every((p) => cronFieldRe.test(p));
}

/**
 * Sonraki calisma zamanini hesaplar (yaklasik). Tam
 * cron parser olmadan; UTC timezone varsayimi ile basit
 * hesap: her gun 03:00 pilot, 02:00 production, 15dk
 * critical. Bu test/pilot ihtiyaclarini karsilar; production
 * scheduler icin `cron-parser` gibi kutuphane onerilir.
 */
export function nextRunTime(
  cron: string,
  now: Date = new Date(),
): Date | null {
  if (!isValidCron(cron)) return null;

  const parts = cron.trim().split(/\s+/);
  const [minute, hour, dom, , dow] = parts;

  // Sadece standart "H M * * *" formu icin hesap
  if (dom !== "*") return null;
  if (dow !== "*") return null;
  if (minute === undefined || hour === undefined) return null;

  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  if (minute === "*" && hour === "*") return null; // sik schedule, ayrı hesap gerekir

  // Belirli saat:dakika deseni (ornek: "0 3 * * *")
  if (minute !== "*" && hour !== "*") {
    const m = parseInt(minute, 10);
    const h = parseInt(hour, 10);
    if (Number.isNaN(m) || Number.isNaN(h)) return null;
    next.setUTCHours(h, m, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  // "*/N * * * *" formu
  if (minute.startsWith("*/") && hour === "*") {
    const step = parseInt(minute.slice(2), 10);
    if (Number.isNaN(step) || step <= 0) return null;
    next.setUTCMinutes(0, 0, 0);
    const elapsedMin = Math.floor((now.getTime() - next.getTime()) / 60000);
    const k = Math.floor(elapsedMin / step) + 1;
    next.setUTCMinutes(k * step);
    return next;
  }

  return null;
}

/** Tier env uzerinden okuma. */
export function readTierFromEnv(env: NodeJS.ProcessEnv = process.env): BackupTier | null {
  const raw = env[ENV_VARS.BACKUP_TIER];
  if (raw === "pilot" || raw === "production" || raw === "critical") {
    return raw;
  }
  return null;
}
