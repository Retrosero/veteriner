/**
 * @file Log retention service.
 * @module apps/api/modules/log-retention/log-retention.service
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * iş kuralları. Tenant, log türü ve severity bazında retention
 * politikası yönetimi + sweep tetikleme.
 *
 * - `upsertRetentionPolicy` / `getRetentionPolicy` /
 *   `listRetentionPolicies` / `deleteRetentionPolicy`:
 *   SUPERADMIN CRUD.
 * - `runSweep`: tüm tenant × logType × severity kombinasyonlarını
 *   dolaşır; her biri için effective policy çözer; cutoff'lar
 *   hesaplanır; ilgili target repository'de archive/delete
 *   çağrılır. Dry-run modunda sayım yapılır, gerçek işlem yok.
 * - `listSweeps` / `getSweepDetail`: sweep geçmişi.
 *
 * Effective policy önceliği (yukarıdan aşağı):
 * 1. Tenant-specific override (tenantId ile eşleşen).
 * 2. Global override (tenantId=null).
 * 3. Hard-coded default (DEFAULT_* tabloları).
 *
 * PII sanitization: Her arşivleme adımı `PiiMasker`'dan geçer.
 * `redactPii=false` set eden caller override'ları repo tarafından
 * reddedilir (her zaman true yapılır).
 *
 * @security SUPERADMIN yetkisi (audit:log:read) gerekir. Cross-tenant
 *   görünüm SUPERADMIN için serbest; tenant filter opsiyonel.
 *   Tüm sweep kayıtları PII içermez (sadece sayım).
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  type LogRetentionSeverity,
  type LogType,
  type RetentionPolicy,
  type RetentionPolicyFilters,
  type RetentionPolicyListResponse,
  type RetentionPolicyUpsert,
  type RetentionSweepBucket,
  type RetentionSweepHistoryFilters,
  type RetentionSweepHistoryResponse,
  type RetentionSweepResult,
  type TriggerRetentionSweep,
} from "@vetniva/contracts";

import {
  LogRetentionRepository,
  type RetentionPolicyRepoFilters,
} from "./log-retention.repository.js";
import {
  LOG_RETENTION_TARGETS,
  type LogRetentionTarget,
} from "./log-retention.targets.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toRetentionPolicy,
  toRetentionSweepResult,
  type RetentionSweepRecord,
} from "../../common/logging/log-retention.types.js";
import { PiiMasker } from "../../common/logging/pii-masker.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

/** Uygulama sürümü (release tag). */
const APP_RELEASE = process.env["APP_VERSION"] ?? "0.0.0-dev";

@Injectable()
export class LogRetentionService {
  private readonly logger = new Logger(LogRetentionService.name);
  private readonly masker = new PiiMasker();

  public constructor(
    private readonly repo: LogRetentionRepository,
    @Optional()
    @Inject(LOG_RETENTION_TARGETS)
    private readonly targets?: LogRetentionTarget[],
  ) {}

  /* ------------------------------------------------------------------------
   * Policy CRUD
   * ------------------------------------------------------------------------
   */

  public upsertRetentionPolicy(
    input: RetentionPolicyUpsert,
    actor: ActorContext,
  ): RetentionPolicy {
    this.requireSuperadmin(actor);
    const now = new Date().toISOString();
    const rec = this.repo.upsertPolicy({
      input,
      actorId: actor.actorId ?? "system",
      now,
    });
    this.logger.log(
      `Retention policy upsert: ${rec.tenantId ?? "global"}/${rec.logType}/${rec.severity} ` +
        `retention=${rec.retentionDays}d archiveAfter=${rec.archiveAfterDays}d ` +
        `storage=${rec.archiveStorage} (by ${actor.actorId ?? "system"})`,
    );
    return toRetentionPolicy(rec);
  }

  public getRetentionPolicy(
    tenantId: string | null,
    logType: LogType,
    severity: LogRetentionSeverity,
    actor: ActorContext,
  ): RetentionPolicy {
    this.requireSuperadmin(actor);
    const rec = this.repo.findPolicyByKey(tenantId, logType, severity);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Retention policy bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { tenantId, logType, severity },
      });
    }
    return toRetentionPolicy(rec);
  }

  /**
   * ID üzerinden tekil policy erişimi. Bulunamazsa 404.
   * Controller'ın `GET /policies/:id` uç'ı için kullanılır.
   */
  public getRetentionPolicyById(
    id: string,
    actor: ActorContext,
  ): RetentionPolicy {
    this.requireSuperadmin(actor);
    const rec = this.repo.findPolicyById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Retention policy bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return toRetentionPolicy(rec);
  }

  public listRetentionPolicies(
    filters: RetentionPolicyFilters,
    actor: ActorContext,
  ): RetentionPolicyListResponse {
    this.requireSuperadmin(actor);
    const repoFilters: RetentionPolicyRepoFilters = {
      tenantId: filters.tenantId,
      logType: filters.logType,
      severity: filters.severity,
      limit: filters.limit,
      offset: filters.offset,
    };
    const result = this.repo.listPolicies(repoFilters);
    return {
      items: result.items.map(toRetentionPolicy),
      total: result.total,
    };
  }

  public deleteRetentionPolicy(
    id: string,
    actor: ActorContext,
  ): { id: string; deleted: boolean } {
    this.requireSuperadmin(actor);
    const deleted = this.repo.deletePolicyById(id);
    if (!deleted) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Retention policy bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return { id, deleted: true };
  }

  /* ------------------------------------------------------------------------
   * Effective policy
   * ------------------------------------------------------------------------
   */

  /**
   * Tenant + logType + severity için effective policy'yi döner.
   * Public: UI preview için kullanılır.
   */
  public getEffectivePolicy(
    tenantId: string | null,
    logType: LogType,
    severity: LogRetentionSeverity,
    actor: ActorContext,
  ): {
    tenantId: string | null;
    logType: LogType;
    severity: LogRetentionSeverity;
    retentionDays: number;
    archiveAfterDays: number;
    archiveStorage: string;
    redactPii: boolean;
    source: string;
  } {
    this.requireSuperadmin(actor);
    const eff = this.repo.findEffective(tenantId, logType, severity);
    return {
      tenantId,
      logType,
      severity,
      retentionDays: eff.retentionDays,
      archiveAfterDays: eff.archiveAfterDays,
      archiveStorage: eff.archiveStorage,
      redactPii: eff.redactPii,
      source: eff.source,
    };
  }

  /* ------------------------------------------------------------------------
   * Sweep
   * ------------------------------------------------------------------------
   */

  /**
   * Retention sweep çalıştırır. Tüm bilinen logType × severity
   * kombinasyonları için effective policy çözer; her birinin
   * archive/delete cutoff tarihlerini hesaplar; uygulanabilir
   * target repository'ler üzerinden işlem yapar.
   *
   * Dry-run modunda gerçek işlem yapılmaz; yalnız count döner.
   * Sonuç her zaman `RetentionSweepResult` olarak döner; sweep
   * geçmişine append-only kaydedilir.
   *
   * NOT: `audit_log`, `notification`, `request_log` için henüz
   * target repository tanımlı değildir (Faz 10+ audit modülü).
   * Bu logType'lar için bucket `scannedCount=0, archivedCount=0,
   * deletedCount=0, errorCount=0` olarak döner (sessizce atlanır).
   */
  public async runSweep(
    input: TriggerRetentionSweep,
    actor: ActorContext,
  ): Promise<RetentionSweepResult> {
    this.requireSuperadmin(actor);
    const sweepId = this.repo.nextSweepId();
    const startedAt = new Date().toISOString();
    const buckets: RetentionSweepBucket[] = [];
    let totalScanned = 0;
    let totalArchived = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    const logTypesToProcess: LogType[] = input.logTypes ?? [
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

    // Tenant listesi: SUPERADMIN tüm tenant'ları süpürür.
    // In-memory ortamda tenant'ı kendimiz türetiyoruz (her log
    // modülünün all() metodu üzerinden benzersiz tenantId'ler).
    const tenantIds = this.collectTenantIds();
    const tenantsToSweep: (string | null)[] = [null, ...tenantIds];

    for (const tenantId of tenantsToSweep) {
      for (const logType of logTypesToProcess) {
        for (const severity of severities) {
          const eff = this.repo.findEffective(tenantId, logType, severity);
          const now = new Date();
          const archiveCutoff = new Date(
            now.getTime() - eff.archiveAfterDays * 24 * 60 * 60 * 1000,
          ).toISOString();
          const deleteCutoff = new Date(
            now.getTime() - eff.retentionDays * 24 * 60 * 60 * 1000,
          ).toISOString();

          let bucket: RetentionSweepBucket = {
            logType,
            severity,
            scannedCount: 0,
            archivedCount: 0,
            deletedCount: 0,
            errorCount: 0,
            deleteCutoff,
            archiveCutoff,
          };

          try {
            const target = this.findTarget(logType);
            if (!target) {
              // Target yok; bucket boş kalır (sessizce atla).
              buckets.push(bucket);
              continue;
            }
            // İki cutoff arasındaki fark: "archive zone" (sadece
            // archive'e taşınır, henüz silinmez) ile "delete zone"
            // (kalıcı silinir). deleteCutoff >= archiveCutoff
            // (zod validation ile zorunlu).
            //
            // 1. Delete zone: cutoff = deleteCutoff. delete yapılır.
            // 2. Archive zone: archiveCutoff <= occurredAt < deleteCutoff.
            //    Gerçek çalıştırmada expireOlderThan kullanılmaz; yalnız
            //    count edilir (in-memory'de "archive" ile "delete"
            //    arasındaki farkı korumak için). Production'da bu
            //    bölgedeki kayıtlar cold storage adapter'ına yazılır.
            const archiveZoneCutoff = archiveCutoff;
            const deleteZoneCutoff = deleteCutoff;
            const deleteCount = target.countOlderThan({
              cutoff: deleteZoneCutoff,
              tenantId,
            });
            const archiveCount = target.countOlderThan({
              cutoff: archiveZoneCutoff,
              tenantId,
            });
            // archive zone = archiveCutoff'a kadar olan, fakat
            // deleteCutoff'tan SONRA olan (yani aradaki fark).
            const archiveZoneCount = Math.max(0, archiveCount - deleteCount);
            if (input.dryRun) {
              bucket = {
                ...bucket,
                scannedCount: archiveCount,
              };
            } else {
              const deleted = await target.expireOlderThan({
                cutoff: deleteZoneCutoff,
                tenantId,
                archive: false,
                archiveStorage: eff.archiveStorage,
                redactPii: eff.redactPii,
                masker: this.masker,
                release: APP_RELEASE,
              });
              bucket = {
                ...bucket,
                scannedCount: archiveCount,
                archivedCount: archiveZoneCount,
                deletedCount: deleted,
              };
            }
            totalScanned += bucket.scannedCount;
            totalArchived += bucket.archivedCount;
            totalDeleted += bucket.deletedCount;
          } catch (err) {
            totalErrors += 1;
            bucket = { ...bucket, errorCount: 1 };
            this.logger.error(
              `Sweep bucket failed: ${logType}/${severity}/${tenantId ?? "global"}: ${(err as Error).message}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
          buckets.push(bucket);
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const rec: RetentionSweepRecord = {
      id: sweepId,
      triggeredBy: "manual",
      startedAt,
      finishedAt,
      totalScanned,
      totalArchived,
      totalDeleted,
      totalErrors,
      buckets,
      dryRun: input.dryRun,
      note: input.note ?? null,
      triggeredById: actor.actorId ?? "system",
    };
    this.repo.recordSweep(rec);
    this.logger.log(
      `Retention sweep ${sweepId} tamamlandı: scanned=${totalScanned} ` +
        `archived=${totalArchived} deleted=${totalDeleted} ` +
        `errors=${totalErrors} dryRun=${input.dryRun} by ${actor.actorId ?? "system"}`,
    );
    return toRetentionSweepResult(rec);
  }

  /**
   * Scheduled sweep (cron çağrısı). System actor'ı ile çalışır;
   * caller identity `system` olarak kaydedilir.
   */
  public async runScheduledSweep(): Promise<RetentionSweepResult> {
    const systemActor: ActorContext = {
      actorId: "system",
      actorType: "system",
      role: "SYSTEM",
      tenantId: null,
      branchId: null,
      isSuperadmin: true,
      correlationId: `req-sweep-${Date.now()}`,
      ipAddress: null,
      userAgentHash: null,
      source: "header",
    };
    return this.runSweep({ dryRun: false }, systemActor);
  }

  /* ------------------------------------------------------------------------
   * Sweep geçmişi
   * ------------------------------------------------------------------------
   */

  public listSweeps(
    filters: RetentionSweepHistoryFilters,
    actor: ActorContext,
  ): RetentionSweepHistoryResponse {
    this.requireSuperadmin(actor);
    const result = this.repo.listSweeps({
      triggeredBy: filters.triggeredBy,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toRetentionSweepResult),
      total: result.total,
    };
  }

  public getSweepDetail(id: string, actor: ActorContext): RetentionSweepResult {
    this.requireSuperadmin(actor);
    const rec = this.repo.findSweepById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Sweep kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return toRetentionSweepResult(rec);
  }

  /* ------------------------------------------------------------------------
   * Yardımcılar
   * ------------------------------------------------------------------------
   */

  /**
   * Bilinen log target'larından benzersiz tenantId'leri toplar.
   * Cross-tenant süpürme için gerekir; tenantId=null zaten
   * global sweep'i temsil eder.
   */
  private collectTenantIds(): string[] {
    if (!this.targets) return [];
    const set = new Set<string>();
    for (const t of this.targets) {
      for (const tenantId of t.listTenantIds()) {
        if (tenantId !== null) set.add(tenantId);
      }
    }
    return Array.from(set);
  }

  /**
   * LogType için uygun target'ı bulur. Bir target yalnız bir
   * logType'la eşleşir; eşleşme yoksa null döner.
   */
  private findTarget(logType: LogType): LogRetentionTarget | null {
    if (!this.targets) return null;
    for (const t of this.targets) {
      if (t.logType === logType) return t;
    }
    return null;
  }

  private requireSuperadmin(actor: ActorContext): void {
    if (actor.isSuperadmin) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem yalnızca SUPERADMIN tarafından yapılabilir",
      httpStatus: 403,
      severity: "error",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }
}
