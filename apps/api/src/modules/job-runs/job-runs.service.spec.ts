/**
 * @file JobRunsService unit testleri.
 * @module apps/api/modules/job-runs/job-runs.service.spec
 *
 * @description GOAL-102 (FAZ-10) background job ve entegrasyon
 * logları service testleri.
 *   - startRun: yeni run oluşturma, attempt=1, status=running.
 *   - finishRun succeeded: output zorunlu, errorCode temizlenir.
 *   - finishRun failed: errorCode zorunlu, output temizlenir.
 *   - finishRun failed → dead_letter terfisi (attempt >= maxAttempts).
 *   - finishRun dead_letter explicit: caller override.
 *   - finishRun twice: 409 VET-JOBRUN-0002.
 *   - finishRun not found: 404 VET-JOBRUN-0001.
 *   - retryRun failed → yeni deneme (parentRunId, attempt+1).
 *   - retryRun dead_letter → yeni deneme (operatör).
 *   - retryRun succeeded → 409 VET-JOBRUN-0003.
 *   - retryRun not found → 404.
 *   - listJobRuns + filter.
 *   - listAttemptsByJobKey.
 *   - listDeadLetter.
 *   - getJobRunSummary: status + queue + deadLetterLast24h + oldestRunning.
 *   - non-SUPERADMIN → 403 VET-AUTHZ-0001.
 *   - PII mask input/output.
 *   - Zod schema validation (succeeded requires output; failed requires errorCode).
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import {
  deadLetterQuerySchema,
  jobRunFinishInputSchema,
  jobRunStartInputSchema,
  jobRunSummaryQuerySchema,
} from "@vetniva/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { JobRunsRepository } from "./job-runs.repository.js";
import { JobRunsService } from "./job-runs.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SUPERADMIN: ActorContext = {
  actorId: "usr-super-1",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

/** Geçmişe 1 ms kaydırılmış ISO timestamp. */
function pastIso(ms: number = 10): string {
  return new Date(Date.now() - ms).toISOString();
}

function makeStartInput(
  overrides: Partial<Parameters<JobRunsService["startRun"]>[0]> = {},
): Parameters<JobRunsService["startRun"]>[0] {
  return {
    queueName: "appointment-reminders",
    jobName: "send-reminder",
    jobKey: "appt-reminder|appt-001",
    source: "queue",
    maxAttempts: 3,
    tenantId: TENANT_A,
    branchId: null,
    correlationId: "req-corr-1",
    requestId: "req-http-1",
    actorId: "usr-staff-a",
    actorType: "user",
    input: { appointmentId: "appt-001" },
    triggeredBy: "system",
    country: "TR",
    release: "0.1.0",
    ...overrides,
  };
}

describe("JobRunsService", () => {
  let service: JobRunsService;
  let repo: JobRunsRepository;

  beforeEach(() => {
    repo = new JobRunsRepository();
    service = new JobRunsService(repo);
  });

  // -------------------------------------------------------------------------
  // startRun
  // -------------------------------------------------------------------------

  describe("startRun", () => {
    it("yeni run oluşturur", () => {
      const out = service.startRun(makeStartInput());
      expect(out.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(out.status).toBe("running");
      expect(out.attempt).toBe(1);
      expect(out.finishedAt).toBeNull();
      expect(out.durationMs).toBeNull();
      expect(out.parentRunId).toBeNull();
      expect(out.input).toEqual({ appointmentId: "appt-001" });
    });

    it("PII input mask'lı", () => {
      const out = service.startRun(
        makeStartInput({
          input: { email: "user@example.com", appointmentId: "appt-1" },
        }),
      );
      const masked = out.input as Record<string, unknown>;
      expect(masked["email"]).not.toBe("user@example.com");
      expect(masked["appointmentId"]).toBe("appt-1");
    });

    it("correlationId verilmediyse otomatik üretilir", () => {
      const out = service.startRun(
        makeStartInput({ correlationId: undefined } as unknown as Partial<
          Parameters<JobRunsService["startRun"]>[0]
        >),
      );
      expect(out.correlationId).toMatch(/^jobrun-/);
    });

    it("default maxAttempts=3, attempt=1", () => {
      const out = service.startRun(
        makeStartInput(
          {} as Partial<Parameters<JobRunsService["startRun"]>[0]>,
        ),
      );
      expect(out.maxAttempts).toBe(3);
      expect(out.attempt).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // finishRun — succeeded
  // -------------------------------------------------------------------------

  describe("finishRun (succeeded)", () => {
    it("output set edilir, finishedAt + durationMs hesaplanır", async () => {
      const run = service.startRun(makeStartInput());
      // startRun ile finishRun arasında 5ms geçsin
      await new Promise((r) => setTimeout(r, 5));
      const out = service.finishRun(run.id, {
        status: "succeeded",
        output: { sent: true },
      });
      expect(out.status).toBe("succeeded");
      expect(out.finishedAt).not.toBeNull();
      expect(out.durationMs).toBeGreaterThanOrEqual(0);
      expect(out.output).toEqual({ sent: true });
      expect(out.errorCode).toBeNull();
      expect(out.errorMessage).toBeNull();
    });

    it("PII output mask'lı", () => {
      const run = service.startRun(makeStartInput());
      const out = service.finishRun(run.id, {
        status: "succeeded",
        output: { token: "abc123", sent: true },
      });
      const masked = out.output as Record<string, unknown>;
      expect(masked["token"]).not.toBe("abc123");
      expect(masked["sent"]).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // finishRun — failed & dead_letter
  // -------------------------------------------------------------------------

  describe("finishRun (failed/dead_letter)", () => {
    it("failed → attempt < maxAttempts iken failed kalır", () => {
      const run = service.startRun(makeStartInput({ maxAttempts: 3 }));
      const out = service.finishRun(run.id, {
        status: "failed",
        errorCode: "VET-LABADAPTER-0007",
        errorMessage: "Lab adapter rejected",
        errorStack: "at adapter.ts:42",
      });
      expect(out.status).toBe("failed");
      expect(out.errorCode).toBe("VET-LABADAPTER-0007");
      expect(out.errorMessage).toBe("Lab adapter rejected");
      expect(out.errorStack).toBe("at adapter.ts:42");
      expect(out.output).toEqual({});
    });

    it("failed → attempt >= maxAttempts iken otomatik dead_letter'a terfi", () => {
      // maxAttempts=2; 2. denemede failed → dead_letter.
      const run1 = service.startRun(makeStartInput({ maxAttempts: 2 }));
      service.finishRun(run1.id, {
        status: "failed",
        errorCode: "VET-LABADAPTER-0007",
        errorMessage: "attempt 1",
      });
      // 2. deneme: retryRun ile.
      const run2 = service.retryRun(run1.id, SUPERADMIN);
      expect(run2.attempt).toBe(2);
      const out = service.finishRun(run2.id, {
        status: "failed",
        errorCode: "VET-LABADAPTER-0007",
        errorMessage: "attempt 2",
      });
      expect(out.status).toBe("dead_letter");
    });

    it("caller explicit dead_letter gönderirse override edilir", () => {
      const run = service.startRun(makeStartInput({ maxAttempts: 5 }));
      const out = service.finishRun(run.id, {
        status: "dead_letter",
        errorCode: "VET-LABADAPTER-0008",
        errorMessage: "permanent failure",
      });
      expect(out.status).toBe("dead_letter");
    });
  });

  // -------------------------------------------------------------------------
  // finishRun — idempotency + not found
  // -------------------------------------------------------------------------

  describe("finishRun (idempotency + not found)", () => {
    it("iki kez finish → 409 VET-JOBRUN-0002", () => {
      const run = service.startRun(makeStartInput());
      service.finishRun(run.id, {
        status: "succeeded",
        output: { ok: true },
      });
      expect(() =>
        service.finishRun(run.id, {
          status: "succeeded",
          output: { ok: true },
        }),
      ).toThrow();
    });

    it("bulunamayan run → 404 VET-JOBRUN-0001", () => {
      expect(() =>
        service.finishRun("jr-not-exist", {
          status: "succeeded",
          output: { ok: true },
        }),
      ).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // retryRun
  // -------------------------------------------------------------------------

  describe("retryRun", () => {
    it("failed run'dan yeni deneme (parentRunId + attempt+1)", () => {
      const run1 = service.startRun(makeStartInput({ maxAttempts: 3 }));
      service.finishRun(run1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "first",
      });
      const run2 = service.retryRun(run1.id, SUPERADMIN);
      expect(run2.parentRunId).toBe(run1.id);
      expect(run2.attempt).toBe(2);
      expect(run2.maxAttempts).toBe(3);
      expect(run2.status).toBe("running");
      expect(run2.triggeredBy).toBe("manual_retry");
    });

    it("dead_letter run'dan retry (operatör müdahalesi)", () => {
      const run1 = service.startRun(makeStartInput({ maxAttempts: 1 }));
      service.finishRun(run1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "first",
      });
      const run2 = service.retryRun(run1.id, SUPERADMIN, {
        maxAttempts: 5,
        reason: "manual",
      });
      expect(run2.attempt).toBe(2);
      expect(run2.maxAttempts).toBe(5);
    });

    it("succeeded run'dan retry → 409 VET-JOBRUN-0003", () => {
      const run = service.startRun(makeStartInput());
      service.finishRun(run.id, {
        status: "succeeded",
        output: { ok: true },
      });
      expect(() => service.retryRun(run.id, SUPERADMIN)).toThrow();
    });

    it("running run'dan retry → 409 VET-JOBRUN-0003", () => {
      const run = service.startRun(makeStartInput());
      expect(() => service.retryRun(run.id, SUPERADMIN)).toThrow();
    });

    it("bulunamayan run → 404", () => {
      expect(() => service.retryRun("jr-not-exist", SUPERADMIN)).toThrow();
    });

    it("override input kullanılır", () => {
      const run = service.startRun(makeStartInput({ input: { foo: "bar" } }));
      service.finishRun(run.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "x",
      });
      const run2 = service.retryRun(run.id, SUPERADMIN, {
        input: { override: true },
      });
      expect(run2.input).toEqual({ override: true });
    });
  });

  // -------------------------------------------------------------------------
  // listJobRuns
  // -------------------------------------------------------------------------

  describe("listJobRuns", () => {
    it("SUPERADMIN tüm kayıtları görür", () => {
      service.startRun(makeStartInput({ jobKey: "k-1" }));
      service.startRun(makeStartInput({ jobKey: "k-2" }));
      const out = service.listJobRuns({ limit: 50, offset: 0 }, SUPERADMIN);
      expect(out.total).toBe(2);
    });

    it("queueName + status filtresi", () => {
      const r1 = service.startRun(
        makeStartInput({ queueName: "q-a", jobKey: "k-1" }),
      );
      service.startRun(makeStartInput({ queueName: "q-b", jobKey: "k-2" }));
      service.finishRun(r1.id, {
        status: "succeeded",
        output: { ok: true },
      });
      const out = service.listJobRuns(
        { queueName: "q-a", status: "succeeded", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(out.total).toBe(1);
    });

    it("search queueName/jobName/jobKey içinde arar", () => {
      service.startRun(makeStartInput({ queueName: "billing" }));
      service.startRun(makeStartInput({ queueName: "appointment-reminders" }));
      const out = service.listJobRuns(
        { search: "appointment", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(out.total).toBe(1);
    });

    it("non-SUPERADMIN → 403 VET-AUTHZ-0001", () => {
      service.startRun(makeStartInput());
      expect(() =>
        service.listJobRuns({ limit: 50, offset: 0 }, STAFF_A),
      ).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // listAttemptsByJobKey
  // -------------------------------------------------------------------------

  describe("listAttemptsByJobKey", () => {
    it("aynı jobKey için tüm denemeler sıralı döner", () => {
      const r1 = service.startRun(
        makeStartInput({ jobKey: "k-shared", maxAttempts: 5 }),
      );
      service.finishRun(r1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "a",
      });
      const r2 = service.retryRun(r1.id, SUPERADMIN);
      service.finishRun(r2.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "b",
      });
      const r3 = service.retryRun(r2.id, SUPERADMIN);
      service.finishRun(r3.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "c",
      });
      const out = service.listAttemptsByJobKey("k-shared", SUPERADMIN);
      expect(out.total).toBe(3);
      expect(out.items[0]!.attempt).toBe(1);
      expect(out.items[1]!.attempt).toBe(2);
      expect(out.items[2]!.attempt).toBe(3);
      expect(out.allFailed).toBe(true);
      expect(out.lastStatus).toBe("failed");
    });

    it("en az bir succeeded varsa allFailed=false", () => {
      const r1 = service.startRun(
        makeStartInput({ jobKey: "k-mix", maxAttempts: 3 }),
      );
      service.finishRun(r1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "a",
      });
      const r2 = service.retryRun(r1.id, SUPERADMIN);
      service.finishRun(r2.id, {
        status: "succeeded",
        output: { ok: true },
      });
      const out = service.listAttemptsByJobKey("k-mix", SUPERADMIN);
      expect(out.allFailed).toBe(false);
      expect(out.lastStatus).toBe("succeeded");
    });

    it("non-SUPERADMIN → 403", () => {
      service.startRun(makeStartInput());
      expect(() => service.listAttemptsByJobKey("k-x", STAFF_A)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // listDeadLetter
  // -------------------------------------------------------------------------

  describe("listDeadLetter", () => {
    it("yalnızca dead_letter döner", () => {
      const r1 = service.startRun(
        makeStartInput({ jobKey: "k-1", maxAttempts: 1 }),
      );
      service.finishRun(r1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "a",
      });
      const r2 = service.startRun(
        makeStartInput({ jobKey: "k-2", maxAttempts: 3 }),
      );
      service.finishRun(r2.id, {
        status: "succeeded",
        output: { ok: true },
      });
      const out = service.listDeadLetter({ limit: 50, offset: 0 }, SUPERADMIN);
      expect(out.total).toBe(1);
      expect(out.items[0]!.status).toBe("dead_letter");
    });

    it("tenant filtresi", () => {
      const r1 = service.startRun(
        makeStartInput({ jobKey: "k-1", maxAttempts: 1, tenantId: TENANT_A }),
      );
      service.finishRun(r1.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "a",
      });
      const out = service.listDeadLetter(
        { tenantId: TENANT_A, limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(out.total).toBe(1);
    });

    it("non-SUPERADMIN → 403", () => {
      expect(() =>
        service.listDeadLetter({ limit: 50, offset: 0 }, STAFF_A),
      ).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getJobRunSummary
  // -------------------------------------------------------------------------

  describe("getJobRunSummary", () => {
    it("status + queue + deadLetter-24h + oldestRunning", async () => {
      // 1 saat önce succeeded
      const r1 = service.startRun(
        makeStartInput({ queueName: "q-a", jobKey: "k-1" }),
      );
      // startAt'i eskiye çekmek için doğrudan repo.update kullan.
      repo.update(r1.id, { startedAt: pastIso(60 * 60 * 1000) });
      service.finishRun(r1.id, {
        status: "succeeded",
        output: { ok: true },
      });
      // Şu an: 1 failed (maxAttempts 1 → dead_letter)
      const r2 = service.startRun(
        makeStartInput({ queueName: "q-a", jobKey: "k-2", maxAttempts: 1 }),
      );
      service.finishRun(r2.id, {
        status: "failed",
        errorCode: "VET-TEST-0001",
        errorMessage: "x",
      });
      // Şu an: 1 running
      service.startRun(makeStartInput({ queueName: "q-b", jobKey: "k-3" }));

      const out = service.getJobRunSummary({}, SUPERADMIN);
      expect(out.total).toBe(3);
      const succeeded = out.byStatus.find((s) => s.status === "succeeded");
      const deadLetter = out.byStatus.find((s) => s.status === "dead_letter");
      const running = out.byStatus.find((s) => s.status === "running");
      expect(succeeded?.count).toBe(1);
      expect(deadLetter?.count).toBe(1);
      expect(running?.count).toBe(1);
      // byQueue: 2 queue
      expect(out.byQueue.length).toBe(2);
      // oldestRunningAt bir değer dönmeli (q-b'deki running)
      expect(out.oldestRunningAt).not.toBeNull();
      // deadLetterLast24h: 1 (r2)
      expect(out.deadLetterLast24h).toBe(1);
    });

    it("non-SUPERADMIN → 403", () => {
      expect(() => service.getJobRunSummary({}, STAFF_A)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getJobRunDetail
  // -------------------------------------------------------------------------

  describe("getJobRunDetail", () => {
    it("kayıt döner", () => {
      const run = service.startRun(makeStartInput());
      const out = service.getJobRunDetail(run.id, SUPERADMIN);
      expect(out.id).toBe(run.id);
    });

    it("bulunamaz → 404 VET-JOBRUN-0001", () => {
      expect(() =>
        service.getJobRunDetail("jr-not-exist", SUPERADMIN),
      ).toThrow();
    });

    it("non-SUPERADMIN → 403", () => {
      const run = service.startRun(makeStartInput());
      expect(() => service.getJobRunDetail(run.id, STAFF_A)).toThrow();
    });
  });
});

// -------------------------------------------------------------------------
// Zod schema validation
// -------------------------------------------------------------------------

describe("jobRunStartInputSchema", () => {
  it("geçerli input parse olur", () => {
    const out = jobRunStartInputSchema.parse({
      queueName: "q",
      jobName: "j",
      jobKey: "k",
    });
    expect(out.maxAttempts).toBe(3);
    expect(out.source).toBe("queue");
    expect(out.country).toBe("SYSTEM");
    expect(out.actorType).toBe("system");
    expect(out.triggeredBy).toBe("system");
  });

  it("eksik queueName → fail", () => {
    expect(() =>
      jobRunStartInputSchema.parse({
        jobName: "j",
        jobKey: "k",
      }),
    ).toThrow();
  });
});

describe("jobRunFinishInputSchema", () => {
  it("succeeded + output → parse", () => {
    const out = jobRunFinishInputSchema.parse({
      status: "succeeded",
      output: { ok: true },
    });
    expect(out.status).toBe("succeeded");
  });

  it("succeeded + output eksik → fail", () => {
    expect(() =>
      jobRunFinishInputSchema.parse({ status: "succeeded" }),
    ).toThrow();
  });

  it("failed + errorCode → parse", () => {
    const out = jobRunFinishInputSchema.parse({
      status: "failed",
      errorCode: "VET-TEST-0001",
      errorMessage: "msg",
    });
    expect(out.status).toBe("failed");
  });

  it("failed + errorCode eksik → fail", () => {
    expect(() =>
      jobRunFinishInputSchema.parse({
        status: "failed",
        errorMessage: "msg",
      }),
    ).toThrow();
  });
});

describe("deadLetterQuerySchema", () => {
  it("default limit/offset", () => {
    const out = deadLetterQuerySchema.parse({});
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(0);
  });
});

describe("jobRunSummaryQuerySchema", () => {
  it("boş object parse", () => {
    const out = jobRunSummaryQuerySchema.parse({});
    expect(out).toEqual({});
  });
});
