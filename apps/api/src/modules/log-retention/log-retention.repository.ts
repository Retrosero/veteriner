/**
 * @file Log retention repository (in-memory).
 * @module apps/api/modules/log-retention/log-retention.repository
 *
 * @description GOAL-106 (FAZ-10) log retention policy ve sweep
 * kayıtları için in-memory depo. DB migration sonraya bırakıldı;
 * production'a geçişte Prisma `LogRetentionPolicy` ve
 * `LogRetentionSweep` tabloları ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Davranış:
 * - `upsertPolicy` anahtarı `(tenantId, logType, severity)`. Aynı
 *   anahtar için mevcut kayıt varsa retentionDays/archiveAfterDays/
 *   archiveStorage/redactPii güncellenir; `createdById`/`createdAt`
 *   korunur, `updatedById`/`updatedAt` yenilenir.
 * - `findEffective(tenantId, logType, severity)`: tenant-specific
 *   override → global override → hard-coded default zincirini
 *   uygular.
 * - `recordSweep` sweep sonucunu append-only geçmişe ekler.
 *   `findSweepById` tekil erişim, `listSweeps` filtreli liste.
 *
 * Tenant izolasyonu:
 * - Policy CRUD SUPERADMIN yetkisi gerektirir; tenant filtresi
 *   opsiyoneldir. Tenant override'ları farklı tenantId ile
 *   ayrı satır olarak tutulur.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { Injectable } from "@nestjs/common";

import {
  DEFAULT_ARCHIVE_AFTER_DAYS,
  DEFAULT_ARCHIVE_STORAGE,
  DEFAULT_RETENTION_DAYS,
  type LogRetentionSeverity,
  type LogType,
} from "@vetniva/contracts";

import {
  type EffectivePolicy,
  type RetentionPolicyCreate,
  type RetentionPolicyRecord,
  type RetentionSweepRecord,
} from "../../common/logging/log-retention.types.js";

/** Policy filtreleri. */
export interface RetentionPolicyRepoFilters {
  tenantId?: string | null | undefined;
  logType?: LogType | undefined;
  severity?: LogRetentionSeverity | undefined;
  limit: number;
  offset: number;
}

/** Sweep filtreleri. */
export interface RetentionSweepRepoFilters {
  triggeredBy?: RetentionSweepRecord["triggeredBy"] | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  offset: number;
}

/**
 * Composite key helper. `null` tenantId için "global" segment
 * kullanılır; böylece Map'te çakışma olmaz.
 */
function policyKey(
  tenantId: string | null,
  logType: LogType,
  severity: LogRetentionSeverity,
): string {
  return `${tenantId ?? "__global__"}|${logType}|${severity}`;
}

@Injectable()
export class LogRetentionRepository {
  /** key: composite(tenantId, logType, severity) → record. */
  private readonly byKey = new Map<string, RetentionPolicyRecord>();
  /** key: id → policy. */
  private readonly byId = new Map<string, RetentionPolicyRecord>();
  /** key: id → sweep. */
  private readonly sweepById = new Map<string, RetentionSweepRecord>();
  /** Global counter'lar. */
  private readonly counter = { policy: 0, sweep: 0 };

  public nextPolicyId(): string {
    this.counter.policy += 1;
    return `lret-pol-${String(this.counter.policy).padStart(8, "0")}`;
  }

  public nextSweepId(): string {
    this.counter.sweep += 1;
    return `lret-swp-${String(this.counter.sweep).padStart(8, "0")}`;
  }

  /**
   * Policy upsert. Anahtar `(tenantId, logType, severity)`. Mevcut
   * kayıt varsa alanlar güncellenir; `createdById`/`createdAt`
   * korunur, `updatedById`/`updatedAt` yenilenir. `id` mevcut
   * kaydın id'si olarak korunur (response sözleşmesi için).
   *
   * NOT: `redactPii` alanı repository tarafından her zaman true
   * yapılır; caller override edemez.
   */
  public upsertPolicy(args: {
    input: RetentionPolicyCreate;
    actorId: string;
    now: string;
  }): RetentionPolicyRecord {
    const key = policyKey(args.input.tenantId, args.input.logType, args.input.severity);
    const existing = this.byKey.get(key);
    if (existing) {
      existing.retentionDays = args.input.retentionDays;
      existing.archiveAfterDays = args.input.archiveAfterDays;
      existing.archiveStorage = args.input.archiveStorage;
      existing.redactPii = true; // hard-coded; caller override edemez
      existing.updatedById = args.actorId;
      existing.updatedAt = args.now;
      this.byKey.set(key, existing);
      this.byId.set(existing.id, existing);
      return existing;
    }
    const id = this.nextPolicyId();
    const rec: RetentionPolicyRecord = {
      id,
      tenantId: args.input.tenantId,
      logType: args.input.logType,
      severity: args.input.severity,
      retentionDays: args.input.retentionDays,
      archiveAfterDays: args.input.archiveAfterDays,
      archiveStorage: args.input.archiveStorage,
      redactPii: true, // hard-coded
      createdById: args.actorId,
      createdAt: args.now,
      updatedById: args.actorId,
      updatedAt: args.now,
    };
    this.byKey.set(key, rec);
    this.byId.set(id, rec);
    return rec;
  }

  /** ID üzerinden tekil erişim. Bulunamazsa null. */
  public findPolicyById(id: string): RetentionPolicyRecord | null {
    return this.byId.get(id) ?? null;
  }

  /** Composite key üzerinden tekil erişim. */
  public findPolicyByKey(
    tenantId: string | null,
    logType: LogType,
    severity: LogRetentionSeverity,
  ): RetentionPolicyRecord | null {
    return this.byKey.get(policyKey(tenantId, logType, severity)) ?? null;
  }

  /** Filtreli arama. */
  public listPolicies(
    filters: RetentionPolicyRepoFilters,
  ): { items: RetentionPolicyRecord[]; total: number } {
    const all: RetentionPolicyRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.tenantId !== undefined && rec.tenantId !== filters.tenantId) {
        continue;
      }
      if (filters.logType && rec.logType !== filters.logType) continue;
      if (filters.severity && rec.severity !== filters.severity) continue;
      all.push(rec);
    }
    all.sort((a, b) => {
      if (a.tenantId === null && b.tenantId !== null) return -1;
      if (b.tenantId === null && a.tenantId !== null) return 1;
      const cmpType = a.logType.localeCompare(b.logType);
      if (cmpType !== 0) return cmpType;
      return a.severity.localeCompare(b.severity);
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Tenant + logType + severity için effective policy çözümler.
   * Öncelik: tenant override → global override → hard-coded
   * default.
   */
  public findEffective(
    tenantId: string | null,
    logType: LogType,
    severity: LogRetentionSeverity,
  ): EffectivePolicy {
    const tenantOverride = this.byKey.get(policyKey(tenantId, logType, severity));
    if (tenantOverride) {
      return {
        retentionDays: tenantOverride.retentionDays,
        archiveAfterDays: tenantOverride.archiveAfterDays,
        archiveStorage: tenantOverride.archiveStorage,
        redactPii: tenantOverride.redactPii,
        source: "tenant_override",
      };
    }
    if (tenantId !== null) {
      const globalOverride = this.byKey.get(
        policyKey(null, logType, severity),
      );
      if (globalOverride) {
        return {
          retentionDays: globalOverride.retentionDays,
          archiveAfterDays: globalOverride.archiveAfterDays,
          archiveStorage: globalOverride.archiveStorage,
          redactPii: globalOverride.redactPii,
          source: "global_override",
        };
      }
    }
    return {
      retentionDays: DEFAULT_RETENTION_DAYS[logType][severity],
      archiveAfterDays: DEFAULT_ARCHIVE_AFTER_DAYS[logType][severity],
      archiveStorage: DEFAULT_ARCHIVE_STORAGE[logType][severity],
      redactPii: true,
      source: "default",
    };
  }

  /**
   * Bir tenantId'nin tüm (logType, severity) kombinasyonları
   * için effective policy'leri döner. Sweep sırasında çağrılır.
   */
  public listEffectiveForTenant(
    tenantId: string | null,
  ): Array<{
    tenantId: string | null;
    logType: LogType;
    severity: LogRetentionSeverity;
    policy: EffectivePolicy;
  }> {
    const logTypes: LogType[] = [
      "audit_log",
      "error_event",
      "security_event",
      "job_run",
      "notification",
      "request_log",
    ];
    const severities: LogRetentionSeverity[] = [
      "info",
      "warning",
      "error",
      "critical",
    ];
    const out: Array<{
      tenantId: string | null;
      logType: LogType;
      severity: LogRetentionSeverity;
      policy: EffectivePolicy;
    }> = [];
    for (const logType of logTypes) {
      for (const severity of severities) {
        out.push({
          tenantId,
          logType,
          severity,
          policy: this.findEffective(tenantId, logType, severity),
        });
      }
    }
    return out;
  }

  /**
   * Policy silme. ID üzerinden. Bulunamazsa false döner.
   */
  public deletePolicyById(id: string): boolean {
    const rec = this.byId.get(id);
    if (!rec) return false;
    const key = policyKey(rec.tenantId, rec.logType, rec.severity);
    this.byId.delete(id);
    this.byKey.delete(key);
    return true;
  }

  /* ------------------------------------------------------------------------
   * Sweep geçmişi — append-only
   * ------------------------------------------------------------------------
   */

  /**
   * Yeni sweep kaydı ekler. ID repo tarafından üretilir. Sweep
   * sonuçları değiştirilemez (append-only).
   */
  public recordSweep(rec: RetentionSweepRecord): RetentionSweepRecord {
    this.sweepById.set(rec.id, rec);
    return rec;
  }

  /** ID üzerinden tekil erişim. */
  public findSweepById(id: string): RetentionSweepRecord | null {
    return this.sweepById.get(id) ?? null;
  }

  /** Filtreli sweep geçmişi. */
  public listSweeps(
    filters: RetentionSweepRepoFilters,
  ): { items: RetentionSweepRecord[]; total: number } {
    const all: RetentionSweepRecord[] = [];
    for (const rec of this.sweepById.values()) {
      if (filters.triggeredBy && rec.triggeredBy !== filters.triggeredBy) {
        continue;
      }
      if (filters.from && rec.startedAt < filters.from) continue;
      if (filters.to && rec.startedAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byKey.clear();
    this.byId.clear();
    this.sweepById.clear();
    this.counter.policy = 0;
    this.counter.sweep = 0;
  }
}
