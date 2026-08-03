/**
 * @file LogRetentionService unit testleri.
 * @module apps/api/modules/log-retention/log-retention.service.spec
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * service testleri.
 *   - upsertRetentionPolicy: tenant + logType + severity anahtarı
 *     ile upsert; redactPii her zaman true kalır.
 *   - getRetentionPolicy / getRetentionPolicyById: 404 yok, mevcut
 *     döner.
 *   - listRetentionPolicies: tenantId/logType/severity filtreleri.
 *   - deleteRetentionPolicy: id bazlı; yoksa 404.
 *   - getEffectivePolicy: tenantOverride → globalOverride → default
 *     öncelik sırası.
 *   - runSweep: tüm (tenant × logType × severity) kombinasyonları
 *     için bucket döner; dryRun=true ise gerçek işlem yok.
 *   - listSweeps / getSweepDetail: append-only geçmiş.
 *   - SUPERADMIN guard: non-superadmin → 403 VET-AUTHZ-0001.
 *   - targets DI boş ise logType'lar boş bucket döner.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { beforeEach, describe, expect, it } from "vitest";

import { LogRetentionRepository } from "./log-retention.repository.js";
import { LogRetentionService } from "./log-retention.service.js";
import { ErrorEventsRepository } from "../error-events/error-events.repository.js";
import { JobRunsRepository } from "../job-runs/job-runs.repository.js";
import { SecurityEventsRepository } from "../security-events/security-events.repository.js";
import { ErrorEventRetentionTarget } from "./targets/error-event.target.js";
import { JobRunRetentionTarget } from "./targets/job-run.target.js";
import { SecurityEventRetentionTarget } from "./targets/security-event.target.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { JobRunRecord } from "../../common/job-runs/job-run.types.js";
import type { ErrorSeverity, SecurityEventSeverity } from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SUPERADMIN: ActorContext = {
  actorId: "usr-super-1",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-super-1",
  ipAddress: "192.168.1.***",
  userAgentHash: "01234567",
  source: "header",
};

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-staff-1",
  ipAddress: "10.0.0.***",
  userAgentHash: "89abcdef",
  source: "header",
};

/** Yardımcı: tüm service + targets + kaynak repo'ları kurar. */
function makeHarness(opts: { withTargets?: boolean } = {}): {
  service: LogRetentionService;
  policyRepo: LogRetentionRepository;
  errorRepo: ErrorEventsRepository;
  securityRepo: SecurityEventsRepository;
  jobRepo: JobRunsRepository;
} {
  const policyRepo = new LogRetentionRepository();
  const errorRepo = new ErrorEventsRepository();
  const securityRepo = new SecurityEventsRepository();
  const jobRepo = new JobRunsRepository();
  if (opts.withTargets) {
    const targets = [
      new ErrorEventRetentionTarget(errorRepo),
      new SecurityEventRetentionTarget(securityRepo),
      new JobRunRetentionTarget(jobRepo),
    ];
    const service = new LogRetentionService(policyRepo, targets);
    return { service, policyRepo, errorRepo, securityRepo, jobRepo };
  }
  const service = new LogRetentionService(policyRepo);
  return { service, policyRepo, errorRepo, securityRepo, jobRepo };
}

describe("LogRetentionService", () => {
  let harness: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    harness = makeHarness({ withTargets: true });
  });

  /* ------------------------------------------------------------------------
   * upsertRetentionPolicy
   * ------------------------------------------------------------------------
   */

  describe("upsertRetentionPolicy", () => {
    it("yeni policy oluşturur", () => {
      const rec = harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "critical",
          retentionDays: 365,
          archiveAfterDays: 60,
          archiveStorage: "cold",
          redactPii: false, // caller reddedemez
        },
        SUPERADMIN,
      );
      expect(rec.tenantId).toBe(TENANT_A);
      expect(rec.logType).toBe("error_event");
      expect(rec.severity).toBe("critical");
      expect(rec.redactPii).toBe(true); // hard-coded true
      expect(rec.createdById).toBe(SUPERADMIN.actorId);
      expect(rec.updatedById).toBe(SUPERADMIN.actorId);
    });

    it("aynı anahtar için mevcut kaydı günceller; createdById/createdAt korunur", async () => {
      const first = harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "critical",
          retentionDays: 365,
          archiveAfterDays: 60,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      await new Promise((r) => setTimeout(r, 5));
      const second = harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "critical",
          retentionDays: 730,
          archiveAfterDays: 90,
          archiveStorage: "none",
          redactPii: false,
        },
        SUPERADMIN,
      );
      expect(second.id).toBe(first.id);
      expect(second.retentionDays).toBe(730);
      expect(second.archiveAfterDays).toBe(90);
      expect(second.archiveStorage).toBe("none");
      expect(second.redactPii).toBe(true);
      expect(second.createdById).toBe(first.createdById);
      expect(second.createdAt).toBe(first.createdAt);
    });

    it("global override (tenantId=null) kabul edilir", () => {
      const rec = harness.service.upsertRetentionPolicy(
        {
          tenantId: null,
          logType: "security_event",
          severity: "critical",
          retentionDays: 2555,
          archiveAfterDays: 730,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      expect(rec.tenantId).toBeNull();
    });

    it("non-superadmin → 403 VET-AUTHZ-0001", () => {
      expect(() =>
        harness.service.upsertRetentionPolicy(
          {
            tenantId: TENANT_A,
            logType: "error_event",
            severity: "info",
            retentionDays: 30,
            archiveAfterDays: 7,
            archiveStorage: "hot",
            redactPii: true,
          },
          STAFF_A,
        ),
      ).toThrow(/SUPERADMIN/);
    });
  });

  /* ------------------------------------------------------------------------
   * getRetentionPolicy / getRetentionPolicyById
   * ------------------------------------------------------------------------
   */

  describe("getRetentionPolicy / getRetentionPolicyById", () => {
    it("ID üzerinden erişim", () => {
      const created = harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "warning",
          retentionDays: 90,
          archiveAfterDays: 14,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const fetched = harness.service.getRetentionPolicyById(
        created.id,
        SUPERADMIN,
      );
      expect(fetched.id).toBe(created.id);
      expect(fetched.retentionDays).toBe(90);
    });

    it("mevcut olmayan ID → 404", () => {
      expect(() =>
        harness.service.getRetentionPolicyById("lret-pol-99999999", SUPERADMIN),
      ).toThrow(/bulunamadı/);
    });

    it("composite key üzerinden erişim", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "job_run",
          severity: "error",
          retentionDays: 30,
          archiveAfterDays: 7,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const fetched = harness.service.getRetentionPolicy(
        TENANT_A,
        "job_run",
        "error",
        SUPERADMIN,
      );
      expect(fetched.tenantId).toBe(TENANT_A);
      expect(fetched.logType).toBe("job_run");
      expect(fetched.severity).toBe("error");
    });

    it("mevcut olmayan composite key → 404", () => {
      expect(() =>
        harness.service.getRetentionPolicy(
          TENANT_A,
          "audit_log",
          "info",
          SUPERADMIN,
        ),
      ).toThrow(/bulunamadı/);
    });
  });

  /* ------------------------------------------------------------------------
   * listRetentionPolicies
   * ------------------------------------------------------------------------
   */

  describe("listRetentionPolicies", () => {
    it("filtre yoksa tüm policy'leri döner", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "info",
          retentionDays: 30,
          archiveAfterDays: 7,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      harness.service.upsertRetentionPolicy(
        {
          tenantId: null,
          logType: "security_event",
          severity: "critical",
          retentionDays: 2555,
          archiveAfterDays: 730,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const list = harness.service.listRetentionPolicies(
        { limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(list.total).toBe(2);
      expect(list.items.length).toBe(2);
    });

    it("tenantId filtresi", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "info",
          retentionDays: 30,
          archiveAfterDays: 7,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_B,
          logType: "error_event",
          severity: "info",
          retentionDays: 60,
          archiveAfterDays: 14,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const list = harness.service.listRetentionPolicies(
        { tenantId: TENANT_A, limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.tenantId).toBe(TENANT_A);
    });
  });

  /* ------------------------------------------------------------------------
   * deleteRetentionPolicy
   * ------------------------------------------------------------------------
   */

  describe("deleteRetentionPolicy", () => {
    it("policy siler", () => {
      const created = harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "warning",
          retentionDays: 90,
          archiveAfterDays: 14,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const result = harness.service.deleteRetentionPolicy(
        created.id,
        SUPERADMIN,
      );
      expect(result.deleted).toBe(true);
      // Tekrar erişim 404.
      expect(() =>
        harness.service.getRetentionPolicyById(created.id, SUPERADMIN),
      ).toThrow(/bulunamadı/);
    });

    it("mevcut olmayan ID → 404", () => {
      expect(() =>
        harness.service.deleteRetentionPolicy("lret-pol-99999999", SUPERADMIN),
      ).toThrow(/bulunamadı/);
    });
  });

  /* ------------------------------------------------------------------------
   * getEffectivePolicy — öncelik zinciri
   * ------------------------------------------------------------------------
   */

  describe("getEffectivePolicy", () => {
    it("default (hiç override yok) → hard-coded default", () => {
      const eff = harness.service.getEffectivePolicy(
        TENANT_A,
        "error_event",
        "info",
        SUPERADMIN,
      );
      // DEFAULT_RETENTION_DAYS.error_event.info === 30
      expect(eff.retentionDays).toBe(30);
      expect(eff.archiveAfterDays).toBe(7);
      expect(eff.archiveStorage).toBe("hot");
      expect(eff.redactPii).toBe(true);
      expect(eff.source).toBe("default");
    });

    it("global override → tenant için de geçerli", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: null,
          logType: "error_event",
          severity: "info",
          retentionDays: 100,
          archiveAfterDays: 20,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const eff = harness.service.getEffectivePolicy(
        TENANT_A,
        "error_event",
        "info",
        SUPERADMIN,
      );
      expect(eff.retentionDays).toBe(100);
      expect(eff.archiveAfterDays).toBe(20);
      expect(eff.archiveStorage).toBe("cold");
      expect(eff.source).toBe("global_override");
    });

    it("tenant override global'dan öncelikli", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: null,
          logType: "error_event",
          severity: "info",
          retentionDays: 100,
          archiveAfterDays: 20,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      harness.service.upsertRetentionPolicy(
        {
          tenantId: TENANT_A,
          logType: "error_event",
          severity: "info",
          retentionDays: 200,
          archiveAfterDays: 40,
          archiveStorage: "hot",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const eff = harness.service.getEffectivePolicy(
        TENANT_A,
        "error_event",
        "info",
        SUPERADMIN,
      );
      expect(eff.retentionDays).toBe(200);
      expect(eff.source).toBe("tenant_override");
    });

    it("sadece global override varsa tüm tenant'lar için geçerli", () => {
      harness.service.upsertRetentionPolicy(
        {
          tenantId: null,
          logType: "error_event",
          severity: "info",
          retentionDays: 100,
          archiveAfterDays: 20,
          archiveStorage: "cold",
          redactPii: true,
        },
        SUPERADMIN,
      );
      const effA = harness.service.getEffectivePolicy(
        TENANT_A,
        "error_event",
        "info",
        SUPERADMIN,
      );
      const effB = harness.service.getEffectivePolicy(
        TENANT_B,
        "error_event",
        "info",
        SUPERADMIN,
      );
      expect(effA.source).toBe("global_override");
      expect(effB.source).toBe("global_override");
    });
  });

  /* ------------------------------------------------------------------------
   * runSweep
   * ------------------------------------------------------------------------
   */

  describe("runSweep", () => {
    function seedErrorEvent(
      severity: ErrorSeverity,
      occurredAt: string,
      tenantId: string | null,
    ): void {
      harness.errorRepo.upsertByFingerprint({
        fingerprint: `seed-${tenantId ?? "global"}-${severity}-${occurredAt}`,
        record: {
          requestId: `req-seed-${occurredAt}`,
          tenantId,
          branchId: null,
          userId: null,
          actorType: "system",
          module: "auth",
          route: "POST /api/v1/test",
          release: "test",
          severity,
          errorCode: "VET-AUTH-0001",
          message: `seed ${occurredAt}`,
          statusCode: 500,
          stack: null,
          context: { foo: "bar" },
          country: "SYSTEM",
          occurredAt,
        },
      });
    }

    function seedSecurityEvent(
      severity: SecurityEventSeverity,
      occurredAt: string,
      tenantId: string | null,
    ): void {
      harness.securityRepo.upsertByFingerprint({
        fingerprint: `sec-seed-${tenantId ?? "global"}-${severity}-${occurredAt}`,
        record: {
          requestId: `req-sec-${occurredAt}`,
          tenantId,
          branchId: null,
          userId: null,
          actorType: "system",
          type: "failed_login",
          module: "auth",
          route: "POST /api/v1/auth/login",
          release: "test",
          severity,
          errorCode: null,
          message: `seed ${occurredAt}`,
          statusCode: 401,
          ipAddress: "192.168.1.***",
          userAgentHash: "01234567",
          context: {},
          country: "SYSTEM",
          occurredAt,
        },
      });
    }

    function seedJobRun(occurredAt: string, tenantId: string | null): void {
      // JobRunsRepository.insert JobRunRecord bekliyor; id dışında
      // tüm alanları doldururuz.
      const rec: JobRunRecord = {
        id: `job-${occurredAt}-${tenantId ?? "global"}`,
        queueName: "test-queue",
        jobName: "test-job",
        jobKey: `key-${occurredAt}-${tenantId ?? "global"}`,
        source: "queue",
        status: "succeeded",
        attempt: 1,
        maxAttempts: 3,
        tenantId,
        branchId: null,
        correlationId: `corr-${occurredAt}`,
        requestId: null,
        actorId: null,
        actorType: "system",
        input: {},
        output: {},
        errorCode: null,
        errorMessage: null,
        errorStack: null,
        startedAt: occurredAt,
        finishedAt: occurredAt,
        durationMs: 10,
        parentRunId: null,
        triggeredBy: "system",
        country: "SYSTEM",
        release: "test",
      };
      harness.jobRepo.insert(rec);
    }

    it("dryRun: count döner, gerçek işlem yok", async () => {
      // Eski bir kayıt seed et.
      seedErrorEvent("info", "2020-01-01T00:00:00.000Z", TENANT_A);
      seedErrorEvent("info", new Date().toISOString(), TENANT_A);

      const result = await harness.service.runSweep(
        { dryRun: true, logTypes: ["error_event"] },
        SUPERADMIN,
      );
      expect(result.dryRun).toBe(true);
      // Tüm (TENANT_A + global) × error_event × 4 severity bucket
      // oluşur. Global bucket daima taranır.
      const errorBuckets = result.buckets.filter(
        (b) => b.logType === "error_event",
      );
      expect(errorBuckets.length).toBeGreaterThan(0);
      // 2020 kaydı info severity'si için scanned > 0 olmalı.
      const infoBucket = errorBuckets.find(
        (b) => b.severity === "info" && b.scannedCount > 0,
      );
      expect(infoBucket).toBeDefined();
      expect(infoBucket?.archivedCount).toBe(0);
      expect(infoBucket?.deletedCount).toBe(0);
      // Toplam archived/deleted = 0 (dry-run).
      expect(result.totalArchived).toBe(0);
      expect(result.totalDeleted).toBe(0);
      // Kayıt hâlâ yerinde.
      expect(harness.errorRepo.all().length).toBe(2);
    });

    it("gerçek çalıştırma: cutoff'tan eski kayıtları siler", async () => {
      seedErrorEvent("info", "2020-01-01T00:00:00.000Z", TENANT_A);
      seedErrorEvent("info", new Date().toISOString(), TENANT_A);
      expect(harness.errorRepo.all().length).toBe(2);

      // Default retention: error_event/info → 30 gün
      const result = await harness.service.runSweep(
        { dryRun: false, logTypes: ["error_event"] },
        SUPERADMIN,
      );
      expect(result.dryRun).toBe(false);
      // 2020 kaydı çok eski; 30 günden de eski. Hem archive hem
      // delete cutoff'unu geçer; archive=false (delete) çalışır.
      expect(result.totalDeleted).toBeGreaterThanOrEqual(1);
      // Bugünkü kayıt korunur.
      expect(harness.errorRepo.all().length).toBe(1);
    });

    it("3 logType için paralel süpürme", async () => {
      seedErrorEvent("info", "2020-01-01T00:00:00.000Z", TENANT_A);
      seedSecurityEvent("warning", "2020-01-01T00:00:00.000Z", TENANT_A);
      seedJobRun("2020-01-01T00:00:00.000Z", TENANT_A);

      const result = await harness.service.runSweep(
        { dryRun: false },
        SUPERADMIN,
      );
      expect(result.buckets.length).toBeGreaterThan(0);
      const errBuckets = result.buckets.filter(
        (b) => b.logType === "error_event",
      );
      const secBuckets = result.buckets.filter(
        (b) => b.logType === "security_event",
      );
      const jobBuckets = result.buckets.filter((b) => b.logType === "job_run");
      expect(errBuckets.length).toBeGreaterThan(0);
      expect(secBuckets.length).toBeGreaterThan(0);
      expect(jobBuckets.length).toBeGreaterThan(0);
    });

    it("targets DI boş ise tüm logType'lar boş bucket döner", async () => {
      const noTargetHarness = makeHarness({ withTargets: false });
      const result = await noTargetHarness.service.runSweep(
        { dryRun: false },
        SUPERADMIN,
      );
      // 6 logType × 4 severity × (null + tenantIds) bucket.
      expect(result.buckets.length).toBeGreaterThan(0);
      for (const b of result.buckets) {
        expect(b.scannedCount).toBe(0);
        expect(b.archivedCount).toBe(0);
        expect(b.deletedCount).toBe(0);
      }
    });

    it("non-superadmin → 403 VET-AUTHZ-0001", async () => {
      await expect(
        harness.service.runSweep({ dryRun: true }, STAFF_A),
      ).rejects.toThrow(/SUPERADMIN/);
    });

    it("global (tenantId=null) kayıtlar da süpürülür", async () => {
      seedErrorEvent("info", "2020-01-01T00:00:00.000Z", null);
      expect(harness.errorRepo.all().length).toBe(1);
      const result = await harness.service.runSweep(
        { dryRun: false, logTypes: ["error_event"] },
        SUPERADMIN,
      );
      // Global info default retention = 30 gün; 2020 kaydı eski.
      // Global bucket'ı en az 1 deleted göstermeli.
      const globalInfo = result.buckets.find(
        (b) =>
          b.logType === "error_event" &&
          b.severity === "info" &&
          b.deletedCount > 0,
      );
      expect(globalInfo).toBeDefined();
      expect(harness.errorRepo.all().length).toBe(0);
    });
  });

  /* ------------------------------------------------------------------------
   * runScheduledSweep
   * ------------------------------------------------------------------------
   */

  describe("runScheduledSweep", () => {
    it("system actor ile çalışır, triggeredBy=manual kaydeder", async () => {
      const result = await harness.service.runScheduledSweep();
      expect(result.triggeredBy).toBe("manual");
      expect(result.sweepId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  /* ------------------------------------------------------------------------
   * listSweeps / getSweepDetail
   * ------------------------------------------------------------------------
   */

  describe("listSweeps / getSweepDetail", () => {
    it("sweep sonrası geçmişte görünür", async () => {
      const s = await harness.service.runSweep({ dryRun: true }, SUPERADMIN);
      const list = harness.service.listSweeps(
        { limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.sweepId).toBe(s.sweepId);

      const detail = harness.service.getSweepDetail(s.sweepId, SUPERADMIN);
      expect(detail.sweepId).toBe(s.sweepId);
      expect(detail.buckets.length).toBe(s.buckets.length);
    });

    it("triggeredBy filtresi", async () => {
      await harness.service.runSweep({ dryRun: true }, SUPERADMIN);
      const list = harness.service.listSweeps(
        { triggeredBy: "manual", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(list.total).toBe(1);
    });

    it("mevcut olmayan sweep → 404", () => {
      expect(() =>
        harness.service.getSweepDetail("lret-swp-99999999", SUPERADMIN),
      ).toThrow(/bulunamadı/);
    });

    it("non-superadmin → 403 VET-AUTHZ-0001", () => {
      expect(() =>
        harness.service.listSweeps({ limit: 50, offset: 0 }, STAFF_A),
      ).toThrow(/SUPERADMIN/);
    });
  });
});
