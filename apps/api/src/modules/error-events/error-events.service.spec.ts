/**
 * @file ErrorEventsService unit testleri.
 * @module apps/api/modules/error-events/error-events.service.spec
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata yakalama
 * service testleri.
 *   - recordError: fingerprint üretimi + occurrenceCount.
 *   - 4xx stack null; 5xx stack dolu.
 *   - moduleFromRoute: path → modül eşlemesi.
 *   - normalizeMessage: UUID + sayı mask'leme.
 *   - listErrorEvents + getErrorEventDetail.
 *   - getErrorEventSummary: severity + module + bucket'lar.
 *   - Cross-actor (non-SUPERADMIN) → 403 VET-AUTHZ-0001.
 *   - PII mask context'ten geçer.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

import { ErrorEventsService } from "./error-events.service.js";
import { ErrorEventsRepository } from "./error-events.repository.js";
import {
  moduleFromRoute,
  normalizeMessage,
  computeFingerprint,
} from "./error-events.service.js";

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

function makeInput(
  overrides: Partial<Parameters<ErrorEventsService["recordError"]>[0]> = {},
): Parameters<ErrorEventsService["recordError"]>[0] {
  return {
    requestId: "req-test-1",
    tenantId: TENANT_A,
    branchId: null,
    userId: "usr-vet-1",
    actorType: "user",
    module: "clinic",
    route: "POST /api/v1/clinic/patient",
    release: "0.1.0",
    severity: "error",
    errorCode: "VET-CLINIC-0001",
    message: "Test hata",
    statusCode: 500,
    stack: "Error: Test\n  at line 1",
    context: { field: "name" },
    country: "TR",
    occurredAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("ErrorEventsService", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  // -------------------------------------------------------------------------
  // recordError
  // -------------------------------------------------------------------------

  describe("recordError", () => {
    it("yeni hata kaydı oluşturur", () => {
      const out = service.recordError(makeInput());
      expect(out.id).toMatch(/^err-/);
      expect(out.fingerprint).toHaveLength(16);
      expect(out.occurrenceCount).toBe(1);
      expect(out.statusCode).toBe(500);
    });

    it("aynı fingerprint 2. kez → occurrenceCount=2", () => {
      service.recordError(makeInput());
      const out2 = service.recordError(makeInput());
      expect(out2.occurrenceCount).toBe(2);
      // aynı id
      expect(out2.id).toBe(service.recordError(makeInput()).id);
    });

    it("farklı message normalize sonrası aynı fingerprint", () => {
      const a = service.recordError(
        makeInput({ message: "ID 123 not found" }),
      );
      const b = service.recordError(
        makeInput({ message: "ID 456 not found" }),
      );
      // sayılar <n> olur, aynı fingerprint
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(b.occurrenceCount).toBe(2);
    });

    it("UUID normalize edilir", () => {
      const a = service.recordError(
        makeInput({
          message: "Record 00000000-0000-0000-0000-000000000001 missing",
        }),
      );
      const b = service.recordError(
        makeInput({
          message: "Record 00000000-0000-0000-0000-000000000002 missing",
        }),
      );
      expect(a.fingerprint).toBe(b.fingerprint);
    });

    it("4xx status → stack null", () => {
      const out = service.recordError(
        makeInput({ statusCode: 422, severity: "warning", stack: "secret" }),
      );
      expect(out.stack).toBeNull();
    });

    it("5xx status → stack korunur", () => {
      const out = service.recordError(
        makeInput({ statusCode: 500, severity: "error", stack: "secret" }),
      );
      expect(out.stack).toBe("secret");
    });

    it("critical severity → 4xx bile olsa stack korunur", () => {
      const out = service.recordError(
        makeInput({ statusCode: 400, severity: "critical", stack: "x" }),
      );
      expect(out.stack).toBe("x");
    });

    it("PII context mask'lı", () => {
      const out = service.recordError(
        makeInput({
          context: {
            email: "user@example.com",
            phone: "5551234567",
            field: "name",
          },
        }),
      );
      // email/phone mask'lenir; alan adı korunur
      const ctx = out.context as Record<string, unknown>;
      expect(ctx["email"]).not.toBe("user@example.com");
      expect(ctx["phone"]).not.toBe("5551234567");
      expect(ctx["field"]).toBe("name");
    });

    it("occurredAt verilmediyse now() kullanılır", () => {
      const out = service.recordError(
        makeInput({ occurredAt: undefined }),
      );
      expect(out.occurredAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // listErrorEvents
  // -------------------------------------------------------------------------

  describe("listErrorEvents", () => {
    it("SUPERADMIN tüm kayıtları görür", async () => {
      service.recordError(makeInput());
      service.recordError(makeInput({ errorCode: "VET-CLINIC-0002" }));
      const result = await service.listErrorEvents(
        { limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(result.total).toBe(2);
    });

    it("SUPERADMIN olmayan → 403 VET-AUTHZ-0001", async () => {
      service.recordError(makeInput());
      await expect(
        service.listErrorEvents({ limit: 50, offset: 0 }, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("filtreler: severity + module", async () => {
      service.recordError(
        makeInput({ severity: "error", module: "clinic" }),
      );
      service.recordError(
        makeInput({ severity: "warning", module: "auth" }),
      );
      const result = await service.listErrorEvents(
        { severity: "error", module: "clinic", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(result.total).toBe(1);
    });

    it("search message + route", async () => {
      service.recordError(makeInput({ message: "DB timeout on save" }));
      service.recordError(makeInput({ message: "Permission denied" }));
      const result = await service.listErrorEvents(
        { search: "timeout", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(result.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getErrorEventDetail
  // -------------------------------------------------------------------------

  describe("getErrorEventDetail", () => {
    it("kayıt döner", async () => {
      const out = service.recordError(makeInput());
      const detail = await service.getErrorEventDetail(out.id, SUPERADMIN);
      expect(detail.id).toBe(out.id);
    });

    it("bulunamaz → 404 VET-AUDIT-0001", async () => {
      await expect(
        service.getErrorEventDetail("err-not-exist", SUPERADMIN),
      ).rejects.toMatchObject({
        errorCode: "VET-AUDIT-0001",
        httpStatus: 404,
      });
    });

    it("non-SUPERADMIN → 403", async () => {
      const out = service.recordError(makeInput());
      await expect(
        service.getErrorEventDetail(out.id, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listOccurrencesByFingerprint
  // -------------------------------------------------------------------------

  describe("listOccurrencesByFingerprint", () => {
    it("fingerprint ile toplu kayıt döner", async () => {
      service.recordError(makeInput());
      service.recordError(makeInput());
      const a = service.recordError(makeInput());
      const out = await service.listOccurrencesByFingerprint(
        a.fingerprint,
        SUPERADMIN,
      );
      expect(out.occurrenceCount).toBe(3);
    });

    it("bulunamaz → 404", async () => {
      await expect(
        service.listOccurrencesByFingerprint("0000000000000000", SUPERADMIN),
      ).rejects.toMatchObject({
        errorCode: "VET-AUDIT-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // getErrorEventSummary
  // -------------------------------------------------------------------------

  describe("getErrorEventSummary", () => {
    it("severity + module toplam + bucket'lar", async () => {
      service.recordError(
        makeInput({ severity: "error", module: "clinic" }),
      );
      service.recordError(
        makeInput({ severity: "error", module: "clinic" }),
      );
      service.recordError(
        makeInput({
          severity: "warning",
          module: "auth",
          errorCode: "VET-AUTH-0001",
        }),
      );

      const out = await service.getErrorEventSummary(
        {},
        SUPERADMIN,
      );
      expect(out.total).toBe(3);
      // bySeverity: 2 error, 1 warning
      const errorCount = out.bySeverity.find((s) => s.severity === "error");
      const warningCount = out.bySeverity.find(
        (s) => s.severity === "warning",
      );
      expect(errorCount?.count).toBe(2);
      expect(warningCount?.count).toBe(1);
      // byModule
      const clinicMod = out.byModule.find((m) => m.module === "clinic");
      const authMod = out.byModule.find((m) => m.module === "auth");
      expect(clinicMod?.count).toBe(2);
      expect(authMod?.count).toBe(1);
      // topBuckets en az 2 bucket
      expect(out.topBuckets.length).toBeGreaterThanOrEqual(2);
    });

    it("non-SUPERADMIN → 403", async () => {
      service.recordError(makeInput());
      await expect(
        service.getErrorEventSummary({}, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("window filtresi", async () => {
      service.recordError(
        makeInput({
          message: "A hatası",
          occurredAt: "2026-07-01T00:00:00.000Z",
        }),
      );
      service.recordError(
        makeInput({
          message: "B hatası",
          occurredAt: "2026-08-01T00:00:00.000Z",
        }),
      );
      const out = await service.getErrorEventSummary(
        {
          from: "2026-07-15T00:00:00.000Z",
          to: "2026-08-31T00:00:00.000Z",
        },
        SUPERADMIN,
      );
      expect(out.total).toBe(1);
    });
  });
});

// -------------------------------------------------------------------------
// Pure helpers
// -------------------------------------------------------------------------

describe("moduleFromRoute", () => {
  it("auth → /api/v1/auth/*", () => {
    expect(moduleFromRoute("POST /api/v1/auth/login")).toBe("auth");
  });
  it("clinic → /api/v1/clinic/*", () => {
    expect(moduleFromRoute("GET /api/v1/clinic/patient")).toBe("clinic");
  });
  it("payment → /api/v1/payment/*", () => {
    expect(moduleFromRoute("POST /api/v1/payment")).toBe("payment");
  });
  it("lab → /api/v1/lab/*", () => {
    expect(moduleFromRoute("GET /api/v1/lab/order")).toBe("lab");
  });
  it("unknown → fallback", () => {
    expect(moduleFromRoute("GET /api/v1/foo/bar")).toBe("unknown");
  });
});

describe("normalizeMessage", () => {
  it("UUID mask'lenir", () => {
    const out = normalizeMessage(
      "Record 00000000-0000-0000-0000-000000000001 missing",
    );
    expect(out).toBe("Record <uuid> missing");
  });
  it("sayılar mask'lenir", () => {
    const out = normalizeMessage("Field 42 has error 500");
    expect(out).toBe("Field <n> has error <n>");
  });
  it("çoklu boşluk tek boşluğa", () => {
    const out = normalizeMessage("a    b   c");
    expect(out).toBe("a b c");
  });
});

describe("computeFingerprint", () => {
  it("aynı kod+module+message → aynı fingerprint", () => {
    const a = computeFingerprint("VET-X-0001", "clinic", "msg 1");
    const b = computeFingerprint("VET-X-0001", "clinic", "msg 2");
    expect(a).toBe(b);
  });
  it("farklı kod → farklı fingerprint", () => {
    const a = computeFingerprint("VET-X-0001", "clinic", "msg");
    const b = computeFingerprint("VET-X-0002", "clinic", "msg");
    expect(a).not.toBe(b);
  });
  it("16 hex karakter", () => {
    const a = computeFingerprint("VET-X-0001", "clinic", "msg");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});
