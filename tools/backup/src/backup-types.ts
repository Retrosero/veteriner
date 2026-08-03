/**
 * @file Backup/restore tip sozlesmesi.
 * @module @vetniva/backup/types
 *
 * @description GOAL-124 (FAZ-12) kapsaminda backup ve restore
 * test parametrelerinin TypeScript tip tanimlari. PowerShell
 * scriptleri ile ayni semantik; TS tarafindan da test/validate
 * edilebilir. Tenant izolasyonu, audit ve PII kurallarina uyar.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

/** Yedek tier'i. */
export type BackupTier = "pilot" | "production" | "critical";

/** Yedekleme yontemi. */
export type BackupMethod = "pg_dump" | "wal_streaming" | "snapshot";

/** Yedekleme siklik. */
export type BackupFrequency =
  "realtime" | "5min" | "hourly" | "daily" | "weekly" | "monthly";

/** Arşivleme storage tier. */
export type ArchiveStorage = "hot" | "cold" | "none";

/**
 * RPO/RTO tier matrisi. docs/operations/BACKUP_RESTORE.md ile
 * eslesir. Pilot tier 5dk/1saat, production 1dk/30dk,
 * critical (KVKK/UK GDPR) 0/15dk.
 */
export const RPO_RTO_TIERS: Readonly<
  Record<
    BackupTier,
    {
      rpoMinutes: number;
      rtoMinutes: number;
      strategy: string;
      retentionDaily: number;
      retentionWeekly: number;
      retentionMonthly: number;
    }
  >
> = {
  pilot: {
    rpoMinutes: 5,
    rtoMinutes: 60,
    strategy: "Gunluk full + 5dk WAL streaming",
    retentionDaily: 7,
    retentionWeekly: 4,
    retentionMonthly: 12,
  },
  production: {
    rpoMinutes: 1,
    rtoMinutes: 30,
    strategy: "Gunluk full + 1dk WAL streaming + standby",
    retentionDaily: 7,
    retentionWeekly: 4,
    retentionMonthly: 12,
  },
  critical: {
    rpoMinutes: 0,
    rtoMinutes: 15,
    strategy: "Sync replica + multi-region",
    retentionDaily: 7,
    retentionWeekly: 4,
    retentionMonthly: 12,
  },
};

/** Backup gorev tanimi. */
export interface BackupRequest {
  /** Hedef container (Docker). */
  container: string;
  /** Veritabani adi. */
  database: string;
  /** DB kullanici. */
  user: string;
  /** Cikti dizini. */
  outputDirectory: string;
  /** Tier (RPO/RTO secimi). */
  tier: BackupTier;
  /** Sifreleme (AES-256 at-rest). */
  encryption: "aes-256" | "none";
  /** Arşivleme storage. */
  archiveStorage: ArchiveStorage;
}

/** Backup cikti metadata. */
export interface BackupResult {
  /** Yedek dosyasinin tam yolu. */
  backupFile: string;
  /** Boyut (bytes). */
  bytes: number;
  /** Veritabani. */
  database: string;
  /** Tier. */
  tier: BackupTier;
  /** Sifreleme durumu. */
  encrypted: boolean;
  /** Uretim zamani (ISO 8601 UTC). */
  createdAt: string;
}

/** Restore test sonucu. */
export interface RestoreTestResult {
  /** Hedef veritabani (gecici; restore_test_ ile baslar). */
  restoreDatabase: string;
  /** Kaynak backup dosyasi. */
  backupFile: string;
  /** Dogrulanan tablolar + satir sayilari. */
  verifiedTables: Readonly<Record<string, number>>;
  /** Gecici DB silindi mi? */
  cleanedUp: boolean;
  /** Restore suresi (ms). */
  durationMs: number;
  /** Uretim zamani (ISO 8601 UTC). */
  restoredAt: string;
}

/** Tier icin RPO/RTO ozet. */
export interface RpoRtoSummary {
  tier: BackupTier;
  rpoMinutes: number;
  rtoMinutes: number;
  strategy: string;
  description: string;
}

/** Tier RPO/RTO ozetini uretir. */
export function rpoRtoForTier(tier: BackupTier): RpoRtoSummary {
  const cfg = RPO_RTO_TIERS[tier];
  return {
    tier,
    rpoMinutes: cfg.rpoMinutes,
    rtoMinutes: cfg.rtoMinutes,
    strategy: cfg.strategy,
    description: `Tier ${tier}: RPO ${cfg.rpoMinutes}dk, RTO ${cfg.rtoMinutes}dk.`,
  };
}
