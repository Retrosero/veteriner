/**
 * @file ErrorEventsService unit testleri.
 * @module apps/api/modules/error-events/error-events.service.spec
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
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ErrorEventsRepository } from "./error-events.repository.js";
import {
  computeFingerprint,
  ErrorEventsService,
  isValidTransition,
  moduleFromRoute,
  normalizeMessage,
} from "./error-events.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

/**
 *
 */
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
      expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
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

    it("aynı fingerprint farklı tenantlarda ayrı aggregate olarak tutulur", () => {
      const tenantA = service.recordError(makeInput());
      const tenantB = service.recordError(makeInput({ tenantId: TENANT_B }));

      expect(tenantB.fingerprint).toBe(tenantA.fingerprint);
      expect(tenantB.id).not.toBe(tenantA.id);
      expect(tenantA.occurrenceCount).toBe(1);
      expect(tenantB.occurrenceCount).toBe(1);
    });

    it("farklı message normalize sonrası aynı fingerprint", () => {
      const a = service.recordError(makeInput({ message: "ID 123 not found" }));
      const b = service.recordError(makeInput({ message: "ID 456 not found" }));
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
      const out = service.recordError(makeInput({ occurredAt: undefined }));
      expect(out.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
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
      service.recordError(makeInput({ severity: "error", module: "clinic" }));
      service.recordError(makeInput({ severity: "warning", module: "auth" }));
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
      service.recordError(makeInput({ severity: "error", module: "clinic" }));
      service.recordError(makeInput({ severity: "error", module: "clinic" }));
      service.recordError(
        makeInput({
          severity: "warning",
          module: "auth",
          errorCode: "VET-AUTH-0001",
        }),
      );

      const out = await service.getErrorEventSummary({}, SUPERADMIN);
      expect(out.total).toBe(3);
      // bySeverity: 2 error, 1 warning
      const errorCount = out.bySeverity.find((s) => s.severity === "error");
      const warningCount = out.bySeverity.find((s) => s.severity === "warning");
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

// -------------------------------------------------------------------------
// recordClientError (GOAL-101 frontend hata yakalama)
// -------------------------------------------------------------------------

describe("ErrorEventsService.recordClientError", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("minimum input ile kayıt oluşturur", () => {
    const out = service.recordClientError(
      {
        severity: "error",
        message: "Component X is undefined",
        route: "GET /tr-TR/dashboard",
      },
      STAFF_A,
      "req-client-1",
    );
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.fingerprint).toHaveLength(16);
  });

  it("actor bağlamından tenant/branch/userId türetilir", () => {
    service.recordClientError(
      {
        severity: "warning",
        message: "Toast render failed",
        route: "GET /tr-TR/clinic/patient",
      },
      STAFF_A,
      "req-client-2",
    );
    const list = repo.all();
    expect(list).toHaveLength(1);
    expect(list[0]!.tenantId).toBe(TENANT_A);
    expect(list[0]!.branchId).toBeNull();
    expect(list[0]!.userId).toBe("usr-staff-a");
    expect(list[0]!.actorType).toBe("user");
  });

  it("errorCode verilmediyse generic frontend kodu kullanılır", () => {
    const out = service.recordClientError(
      {
        severity: "error",
        message: "Render hatası",
        route: "GET /tr-TR/dashboard",
      },
      STAFF_A,
      "req-client-3",
    );
    const rec = repo.findById(out.id);
    expect(rec?.errorCode).toBe("VET-COMMON-0001");
  });

  it("errorCode verildiyse olduğu gibi kullanılır", () => {
    const out = service.recordClientError(
      {
        severity: "error",
        errorCode: "VET-COMMON-0001",
        message: "Render hatası",
        route: "GET /tr-TR/dashboard",
      },
      STAFF_A,
      "req-client-4",
    );
    const rec = repo.findById(out.id);
    expect(rec?.errorCode).toBe("VET-COMMON-0001");
  });

  it("actorType portal_user olarak işaretlenir", () => {
    const portalActor: ActorContext = {
      ...STAFF_A,
      actorId: "prt-1",
      actorType: "portal_user",
      role: "PET_OWNER_PORTAL",
    };
    service.recordClientError(
      {
        severity: "warning",
        message: "Portal render error",
        route: "GET /portal/pets",
      },
      portalActor,
      "req-portal-1",
    );
    const rec = repo.all()[0]!;
    expect(rec.actorType).toBe("portal_user");
  });

  it("info severity → stack saklanmaz", () => {
    const out = service.recordClientError(
      {
        severity: "info",
        message: "Info",
        route: "GET /tr-TR/dashboard",
        stack: "should-not-persist",
      },
      STAFF_A,
      "req-info-1",
    );
    const rec = repo.findById(out.id);
    expect(rec?.stack).toBeNull();
  });

  it("critical severity → stack saklanır", () => {
    const out = service.recordClientError(
      {
        severity: "critical",
        message: "Critical",
        route: "GET /tr-TR/dashboard",
        stack: "trace",
      },
      STAFF_A,
      "req-crit-1",
    );
    const rec = repo.findById(out.id);
    expect(rec?.stack).toBe("trace");
  });

  it("context PII mask'lı (savunma derinliği)", () => {
    const out = service.recordClientError(
      {
        severity: "warning",
        message: "form submit",
        route: "POST /tr-TR/clinic/owner",
        context: {
          email: "user@example.com",
          password: "secret",
          field: "name",
        },
      },
      STAFF_A,
      "req-pii-1",
    );
    const rec = repo.findById(out.id);
    const ctx = rec?.context as Record<string, unknown>;
    expect(ctx["email"]).not.toBe("user@example.com");
    expect(ctx["password"]).toBe("[redacted]");
    expect(ctx["field"]).toBe("name");
  });

  it("occurredAt client clock korunur", () => {
    const out = service.recordClientError(
      {
        severity: "error",
        message: "client clock",
        route: "GET /tr-TR/dashboard",
        occurredAt: "2026-07-15T08:30:00.000Z",
      },
      STAFF_A,
      "req-clock-1",
    );
    const rec = repo.findById(out.id);
    expect(rec?.occurredAt).toBe("2026-07-15T08:30:00.000Z");
  });

  it("release client verirse onu kullanır, aksi halde APP_RELEASE", () => {
    const withRelease = service.recordClientError(
      {
        severity: "error",
        message: "x",
        route: "GET /tr-TR/dashboard",
        release: "1.2.3",
      },
      STAFF_A,
      "req-rel-1",
    );
    const withoutRelease = service.recordClientError(
      {
        severity: "error",
        message: "y",
        route: "GET /tr-TR/dashboard",
      },
      STAFF_A,
      "req-rel-2",
    );
    expect(repo.findById(withRelease.id)?.release).toBe("1.2.3");
    expect(repo.findById(withoutRelease.id)?.release).toMatch(/.+/);
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — Superadmin hata merkezi: status + firstSeenAt/lastSeenAt
// -------------------------------------------------------------------------

describe("ErrorEventsService.recordError — GOAL-103 status & timestamps", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("yeni kayıt status='new' ve assignedToUserId=null ile başlar", () => {
    const out = service.recordError(makeInput());
    const rec = repo.findById(out.id);
    expect(rec?.status).toBe("new");
    expect(rec?.assignedToUserId).toBeNull();
  });

  it("firstSeenAt ilk oluşturulduğunda occurredAt ile aynı set edilir", () => {
    const out = service.recordError(
      makeInput({ occurredAt: "2026-07-01T00:00:00.000Z" }),
    );
    const rec = repo.findById(out.id);
    expect(rec?.firstSeenAt).toBe("2026-07-01T00:00:00.000Z");
    expect(rec?.lastSeenAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("lastSeenAt her upsert'te güncellenir, firstSeenAt sabit kalır", () => {
    const a = service.recordError(
      makeInput({ occurredAt: "2026-07-01T00:00:00.000Z" }),
    );
    const b = service.recordError(
      makeInput({ occurredAt: "2026-07-05T00:00:00.000Z" }),
    );
    const c = service.recordError(
      makeInput({ occurredAt: "2026-07-10T00:00:00.000Z" }),
    );
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
    const rec = repo.findById(a.id);
    expect(rec?.firstSeenAt).toBe("2026-07-01T00:00:00.000Z");
    expect(rec?.lastSeenAt).toBe("2026-07-10T00:00:00.000Z");
    expect(rec?.occurrenceCount).toBe(3);
  });

  it("resolved kayıt → yeni hata → otomatik reopened terfisi", async () => {
    const initial = service.recordError(
      makeInput({ occurredAt: "2026-07-01T00:00:00.000Z" }),
    );
    await service.updateErrorEventStatus(
      initial.id,
      { toStatus: "resolved", reason: "Düzeltildi" },
      SUPERADMIN,
    );
    expect(repo.findById(initial.id)?.status).toBe("resolved");

    // yeni hata
    const after = service.recordError(
      makeInput({ occurredAt: "2026-07-15T00:00:00.000Z" }),
    );
    expect(after.id).toBe(initial.id);
    expect(repo.findById(initial.id)?.status).toBe("reopened");

    // Sistem kaynaklı otomatik transition log'a yazılır.
    const transitions = repo.listTransitionsByFingerprint(
      initial.fingerprint,
      initial.tenantId,
    );
    const auto = transitions.find(
      (t) => t.fromStatus === "resolved" && t.toStatus === "reopened",
    );
    expect(auto).toBeDefined();
    expect(auto?.actorId).toBe("system");
    expect(auto?.actorType).toBe("system");
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — isValidTransition pure helper
// -------------------------------------------------------------------------

describe("isValidTransition", () => {
  it("new → investigating geçerli", () => {
    expect(isValidTransition("new", "investigating")).toBe(true);
  });
  it("new → resolved geçerli", () => {
    expect(isValidTransition("new", "resolved")).toBe(true);
  });
  it("investigating → resolved geçerli", () => {
    expect(isValidTransition("investigating", "resolved")).toBe(true);
  });
  it("investigating → new geçerli", () => {
    expect(isValidTransition("investigating", "new")).toBe(true);
  });
  it("resolved → reopened geçerli", () => {
    expect(isValidTransition("resolved", "reopened")).toBe(true);
  });
  it("resolved → investigating geçerli", () => {
    expect(isValidTransition("resolved", "investigating")).toBe(true);
  });
  it("reopened → investigating geçerli", () => {
    expect(isValidTransition("reopened", "investigating")).toBe(true);
  });
  it("reopened → resolved geçerli", () => {
    expect(isValidTransition("reopened", "resolved")).toBe(true);
  });
  it("new → reopened geçersiz", () => {
    expect(isValidTransition("new", "reopened")).toBe(false);
  });
  it("resolved → new geçersiz", () => {
    expect(isValidTransition("resolved", "new")).toBe(false);
  });
  it("aynı duruma geçiş geçersiz", () => {
    expect(isValidTransition("new", "new")).toBe(false);
    expect(isValidTransition("resolved", "resolved")).toBe(false);
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — updateErrorEventStatus
// -------------------------------------------------------------------------

describe("ErrorEventsService.updateErrorEventStatus", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("new → investigating başarılı + transition log", async () => {
    const ev = service.recordError(makeInput());
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating", reason: "İnceleniyor" },
      SUPERADMIN,
    );
    expect(result.event.status).toBe("investigating");
    expect(result.transition.fromStatus).toBe("new");
    expect(result.transition.toStatus).toBe("investigating");
    expect(result.transition.reason).toBe("İnceleniyor");
    expect(result.transition.actorId).toBe(SUPERADMIN.actorId);
  });

  it("investigating → resolved başarılı", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating" },
      SUPERADMIN,
    );
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    expect(result.event.status).toBe("resolved");
  });

  it("resolved → reopened manuel olarak yapılabilir", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "reopened" },
      SUPERADMIN,
    );
    expect(result.event.status).toBe("reopened");
  });

  it("reopened → investigating başarılı", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "reopened" },
      SUPERADMIN,
    );
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating" },
      SUPERADMIN,
    );
    expect(result.event.status).toBe("investigating");
  });

  it("geçersiz geçiş → 422 VET-ERRSTAT-0001", async () => {
    const ev = service.recordError(makeInput());
    await expect(
      service.updateErrorEventStatus(
        ev.id,
        { toStatus: "reopened" },
        SUPERADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-ERRSTAT-0001",
      httpStatus: 422,
    });
  });

  it("aynı duruma geçiş → 422", async () => {
    const ev = service.recordError(makeInput());
    await expect(
      service.updateErrorEventStatus(ev.id, { toStatus: "new" }, SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-ERRSTAT-0001",
      httpStatus: 422,
    });
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.updateErrorEventStatus(
        "err-not-found",
        { toStatus: "investigating" },
        SUPERADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const ev = service.recordError(makeInput());
    await expect(
      service.updateErrorEventStatus(
        ev.id,
        { toStatus: "investigating" },
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });

  it("assignedToUserId atanır", async () => {
    const ev = service.recordError(makeInput());
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating", assignedToUserId: "usr-sa-2" },
      SUPERADMIN,
    );
    expect(result.event.assignedToUserId).toBe("usr-sa-2");
  });

  it("clearAssignment=true atamayı kaldırır", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating", assignedToUserId: "usr-sa-2" },
      SUPERADMIN,
    );
    const result = await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved", clearAssignment: true },
      SUPERADMIN,
    );
    expect(result.event.assignedToUserId).toBeNull();
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — listErrorEventTransitions
// -------------------------------------------------------------------------

describe("ErrorEventsService.listErrorEventTransitions", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("tüm geçişleri fingerprint ile döner", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "investigating" },
      SUPERADMIN,
    );
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    const out = await service.listErrorEventTransitions(ev.id, SUPERADMIN);
    expect(out.fingerprint).toBe(ev.fingerprint);
    expect(out.total).toBe(2);
    expect(out.items[0]!.fromStatus).toBe("new");
    expect(out.items[0]!.toStatus).toBe("investigating");
    expect(out.items[1]!.fromStatus).toBe("investigating");
    expect(out.items[1]!.toStatus).toBe("resolved");
  });

  it("otomatik reopened transition'ı da log'a yazılır", async () => {
    const ev = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      ev.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    // yeni hata (aynı fingerprint)
    service.recordError(makeInput({ message: "Test hata" }));
    const out = await service.listErrorEventTransitions(ev.id, SUPERADMIN);
    // 1 manuel (resolved) + 1 otomatik (reopened)
    expect(out.total).toBe(2);
    const reopened = out.items.find((t) => t.toStatus === "reopened");
    expect(reopened?.fromStatus).toBe("resolved");
    expect(reopened?.actorId).toBe("system");
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.listErrorEventTransitions("err-x", SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const ev = service.recordError(makeInput());
    await expect(
      service.listErrorEventTransitions(ev.id, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — listErrorEventGroups / getErrorEventGroup
// -------------------------------------------------------------------------

describe("ErrorEventsService.listErrorEventGroups", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("fingerprint grupları occurrenceCount DESC sıralı", async () => {
    const a = service.recordError(makeInput());
    service.recordError(makeInput()); // aynı fingerprint
    service.recordError(makeInput({ errorCode: "VET-CLINIC-0002" })); // farklı
    const out = await service.listErrorEventGroups(
      { limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.total).toBe(2);
    expect(out.items[0]!.fingerprint).toBe(a.fingerprint);
    expect(out.items[0]!.eventCount).toBe(2);
  });

  it("status filtresi", async () => {
    const a = service.recordError(makeInput());
    const b = service.recordError(makeInput({ message: "farklı mesaj X" }));
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "resolved" },
      SUPERADMIN,
    );
    const out = await service.listErrorEventGroups(
      { status: "resolved", limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.items.some((g) => g.fingerprint === a.fingerprint)).toBe(true);
    expect(out.items.some((g) => g.fingerprint === b.fingerprint)).toBe(false);
  });

  it("severity filtresi", async () => {
    service.recordError(makeInput({ severity: "error" }));
    service.recordError(makeInput({ severity: "info", message: "info msg" }));
    const out = await service.listErrorEventGroups(
      { severity: "error", limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.total).toBe(1);
  });

  it("non-SUPERADMIN → 403", async () => {
    await expect(
      service.listErrorEventGroups({ limit: 50, offset: 0 }, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

describe("ErrorEventsService.getErrorEventGroup", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("fingerprint grubu detayı döner", async () => {
    const a = service.recordError(makeInput());
    service.recordError(makeInput());
    const out = await service.getErrorEventGroup(a.fingerprint, SUPERADMIN);
    expect(out.fingerprint).toBe(a.fingerprint);
    expect(out.eventCount).toBe(2);
    expect(out.status).toBe("new");
  });

  it("bulunamaz → 404", async () => {
    await expect(
      service.getErrorEventGroup("0000000000000000", SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.getErrorEventGroup(a.fingerprint, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

// -------------------------------------------------------------------------
// GOAL-103 — Ek filtreler: status / branchId / release / assignedToUserId
// -------------------------------------------------------------------------

describe("ErrorEventsService.listErrorEvents — GOAL-103 ek filtreler", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("status filtresi", async () => {
    const a = service.recordError(makeInput());
    service.recordError(makeInput({ message: "ikinci" }));
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "investigating" },
      SUPERADMIN,
    );
    const out = await service.listErrorEvents(
      { status: "investigating", limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.total).toBe(1);
  });

  it("branchId filtresi", async () => {
    service.recordError(
      makeInput({
        branchId: "11111111-1111-1111-1111-111111111111",
        errorCode: "VET-CLINIC-0001",
      }),
    );
    service.recordError(
      makeInput({
        branchId: "22222222-2222-2222-2222-222222222222",
        errorCode: "VET-CLINIC-0002",
      }),
    );
    const out = await service.listErrorEvents(
      {
        branchId: "11111111-1111-1111-1111-111111111111",
        limit: 50,
        offset: 0,
      },
      SUPERADMIN,
    );
    expect(out.total).toBe(1);
  });

  it("release filtresi", async () => {
    service.recordError(makeInput({ release: "1.0.0" }));
    service.recordError(makeInput({ release: "2.0.0" }));
    const out = await service.listErrorEvents(
      { release: "1.0.0", limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.total).toBe(1);
  });

  it("assignedToUserId filtresi", async () => {
    const a = service.recordError(makeInput());
    service.recordError(makeInput({ message: "başka hata" }));
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "investigating", assignedToUserId: "usr-sa-7" },
      SUPERADMIN,
    );
    const out = await service.listErrorEvents(
      { assignedToUserId: "usr-sa-7", limit: 50, offset: 0 },
      SUPERADMIN,
    );
    expect(out.total).toBe(1);
  });
});

// -------------------------------------------------------------------------
// GOAL-104 — Hata atama ve çözüm notları
// -------------------------------------------------------------------------

describe("ErrorEventsService.addErrorEventNote — GOAL-104", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("çözüm notu ekler; authorId/authorType aktör bağlamından gelir", async () => {
    const a = service.recordError(makeInput());
    const note = await service.addErrorEventNote(
      a.id,
      { body: "Bu hata DB deadlock'tan kaynaklanıyor." },
      SUPERADMIN,
    );
    expect(note.fingerprint).toBe(a.fingerprint);
    expect(note.authorId).toBe("usr-super-1");
    expect(note.authorType).toBe("user");
    expect(note.visibility).toBe("internal");
    expect(note.body).toContain("DB deadlock");
  });

  it("not body PII içerikleri mask'lenir (email/TCKN)", async () => {
    const a = service.recordError(makeInput());
    const note = await service.addErrorEventNote(
      a.id,
      {
        body: "Müşteri email test@example.com TCKN 12345678901 ile loglanmış",
      },
      SUPERADMIN,
    );
    expect(note.body).not.toContain("test@example.com");
    expect(note.body).not.toContain("12345678901");
    expect(note.body).toContain("***@***");
    expect(note.body).toContain("***");
  });

  it("visibility=shared kabul eder", async () => {
    const a = service.recordError(makeInput());
    const note = await service.addErrorEventNote(
      a.id,
      { body: "tenant yönetimine açık not", visibility: "shared" },
      SUPERADMIN,
    );
    expect(note.visibility).toBe("shared");
  });

  it("append-only; birden fazla not eklenebilir", async () => {
    const a = service.recordError(makeInput());
    await service.addErrorEventNote(a.id, { body: "ilk not" }, SUPERADMIN);
    const second = await service.addErrorEventNote(
      a.id,
      { body: "ikinci not" },
      SUPERADMIN,
    );
    const list = await service.listErrorEventNotes(a.id, SUPERADMIN);
    expect(list.total).toBe(2);
    expect(list.items[0]?.body).toBe("ilk not");
    expect(list.items[1]?.id).toBe(second.id);
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.addErrorEventNote("err-9999999", { body: "x" }, SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.addErrorEventNote(a.id, { body: "x" }, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

describe("ErrorEventsService.addErrorEventSupportLink — GOAL-104", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("JIRA externalId ile destek bağlantısı ekler", async () => {
    const a = service.recordError(makeInput());
    const link = await service.addErrorEventSupportLink(
      a.id,
      { system: "jira", externalId: "VET-1234" },
      SUPERADMIN,
    );
    expect(link.system).toBe("jira");
    expect(link.externalId).toBe("VET-1234");
    expect(link.url).toBeNull();
    expect(link.createdById).toBe("usr-super-1");
  });

  it("GitHub url ile destek bağlantısı ekler", async () => {
    const a = service.recordError(makeInput());
    const link = await service.addErrorEventSupportLink(
      a.id,
      { system: "github", url: "https://github.com/vetniva/issues/42" },
      SUPERADMIN,
    );
    expect(link.system).toBe("github");
    expect(link.url).toBe("https://github.com/vetniva/issues/42");
    expect(link.externalId).toBeNull();
  });

  it("title opsiyonel olarak eklenir", async () => {
    const a = service.recordError(makeInput());
    const link = await service.addErrorEventSupportLink(
      a.id,
      {
        system: "linear",
        externalId: "VET-1",
        title: "Veritabanı deadlock çözümü",
      },
      SUPERADMIN,
    );
    expect(link.title).toBe("Veritabanı deadlock çözümü");
  });

  it("append-only; birden fazla bağlantı eklenebilir", async () => {
    const a = service.recordError(makeInput());
    await service.addErrorEventSupportLink(
      a.id,
      { system: "jira", externalId: "VET-1" },
      SUPERADMIN,
    );
    await service.addErrorEventSupportLink(
      a.id,
      { system: "github", url: "https://x.com" },
      SUPERADMIN,
    );
    const list = await service.listErrorEventSupportLinks(a.id, SUPERADMIN);
    expect(list.total).toBe(2);
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.addErrorEventSupportLink(
        "err-9999999",
        { system: "jira", externalId: "VET-1" },
        SUPERADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.addErrorEventSupportLink(
        a.id,
        { system: "jira", externalId: "VET-1" },
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

describe("ErrorEventsService.assignErrorEvent — GOAL-104", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("atama yapar; assignedToUserId güncellenir", async () => {
    const a = service.recordError(makeInput());
    const out = await service.assignErrorEvent(
      a.id,
      { assigneeId: "usr-dev-7", reason: "veritabanı ekibi" },
      SUPERADMIN,
    );
    expect(out.assignment.assigneeId).toBe("usr-dev-7");
    expect(out.assignment.assignedById).toBe("usr-super-1");
    expect(out.assignment.reason).toBe("veritabanı ekibi");
    expect(out.event.assignedToUserId).toBe("usr-dev-7");
  });

  it("unassign=true mevcut atamayı kaldırır", async () => {
    const a = service.recordError(makeInput());
    await service.assignErrorEvent(
      a.id,
      { assigneeId: "usr-dev-1" },
      SUPERADMIN,
    );
    const out = await service.assignErrorEvent(
      a.id,
      { unassign: true, reason: "dev-1 izinli" },
      SUPERADMIN,
    );
    expect(out.assignment.assigneeId).toBe("unassigned");
    expect(out.event.assignedToUserId).toBeNull();
  });

  it("atama geçmişi append-only saklanır", async () => {
    const a = service.recordError(makeInput());
    await service.assignErrorEvent(a.id, { assigneeId: "usr-1" }, SUPERADMIN);
    await service.assignErrorEvent(a.id, { assigneeId: "usr-2" }, SUPERADMIN);
    await service.assignErrorEvent(a.id, { unassign: true }, SUPERADMIN);
    const list = await service.listErrorEventAssignments(a.id, SUPERADMIN);
    expect(list.total).toBe(3);
    expect(list.items[0]?.assigneeId).toBe("usr-1");
    expect(list.items[1]?.assigneeId).toBe("usr-2");
    expect(list.items[2]?.assigneeId).toBe("unassigned");
  });

  it("status değişikliği yapmaz (atama salt atama)", async () => {
    const a = service.recordError(makeInput());
    const out = await service.assignErrorEvent(
      a.id,
      { assigneeId: "usr-1" },
      SUPERADMIN,
    );
    expect(out.event.status).toBe("new");
  });

  it("ne assigneeId ne unassign → 422", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.assignErrorEvent(a.id, { reason: "yok" }, SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-ERRNOTE-0001",
      httpStatus: 422,
    });
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.assignErrorEvent(
        "err-9999999",
        { assigneeId: "usr-1" },
        SUPERADMIN,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.assignErrorEvent(a.id, { assigneeId: "usr-1" }, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

describe("ErrorEventsService.listErrorEventAuditLog — GOAL-104", () => {
  let service: ErrorEventsService;
  let repo: ErrorEventsRepository;

  beforeEach(() => {
    repo = new ErrorEventsRepository();
    service = new ErrorEventsService(repo);
  });

  it("status transition + not + support + atama birleşik sıralanır", async () => {
    const a = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "investigating", reason: "bakalım" },
      SUPERADMIN,
    );
    await service.addErrorEventNote(a.id, { body: "DB deadlock" }, SUPERADMIN);
    await service.addErrorEventSupportLink(
      a.id,
      { system: "jira", externalId: "VET-9" },
      SUPERADMIN,
    );
    await service.assignErrorEvent(a.id, { assigneeId: "usr-1" }, SUPERADMIN);
    const log = await service.listErrorEventAuditLog(a.id, SUPERADMIN);
    expect(log.fingerprint).toBe(a.fingerprint);
    // 4 aksiyon var: status, not, support, atama
    expect(log.total).toBe(4);
    const actions = log.items.map((e) => e.action).sort();
    expect(actions).toEqual(
      [
        "assignment_changed",
        "note_added",
        "status_transition",
        "support_link_added",
      ].sort(),
    );
  });

  it("occurredAt artan sırada döner", async () => {
    const a = service.recordError(makeInput());
    await service.addErrorEventNote(a.id, { body: "not" }, SUPERADMIN);
    await service.assignErrorEvent(a.id, { assigneeId: "usr-1" }, SUPERADMIN);
    const log = await service.listErrorEventAuditLog(a.id, SUPERADMIN);
    const times = log.items.map((e) => e.occurredAt);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });

  it("occurrence_recorded resolved→reopened otomatik terfisinde eklenir", async () => {
    const a = service.recordError(makeInput());
    // Çöz → yeni hata oluşunca reopened terfisi.
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "resolved", reason: "geçici çözüm" },
      SUPERADMIN,
    );
    // Aynı fingerprint için yeni kayıt → reopened terfisi.
    service.recordError(
      makeInput({
        occurredAt: "2026-07-30T12:30:00.000Z",
        userId: "usr-vet-2",
      }),
    );
    const log = await service.listErrorEventAuditLog(a.id, SUPERADMIN);
    const occ = log.items.find((e) => e.action === "occurrence_recorded");
    expect(occ).toBeDefined();
    expect(occ?.details["transitionId"]).toBeDefined();
  });

  it("details payload'ı aksiyona göre şekillenir", async () => {
    const a = service.recordError(makeInput());
    await service.updateErrorEventStatus(
      a.id,
      { toStatus: "resolved", reason: "geçici çözüm" },
      SUPERADMIN,
    );
    await service.addErrorEventNote(a.id, { body: "test" }, SUPERADMIN);
    const log = await service.listErrorEventAuditLog(a.id, SUPERADMIN);
    const statusItem = log.items.find((e) => e.action === "status_transition");
    const noteItem = log.items.find((e) => e.action === "note_added");
    expect(statusItem?.details["fromStatus"]).toBe("new");
    expect(statusItem?.details["toStatus"]).toBe("resolved");
    expect(statusItem?.details["reason"]).toBe("geçici çözüm");
    expect(noteItem?.details["noteId"]).toBeDefined();
    expect(noteItem?.details["visibility"]).toBe("internal");
  });

  it("bulunamayan id → 404", async () => {
    await expect(
      service.listErrorEventAuditLog("err-9999999", SUPERADMIN),
    ).rejects.toMatchObject({
      errorCode: "VET-AUDIT-0001",
      httpStatus: 404,
    });
  });

  it("non-SUPERADMIN → 403", async () => {
    const a = service.recordError(makeInput());
    await expect(
      service.listErrorEventAuditLog(a.id, STAFF_A),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });
});

describe("PiiMasker.maskString — GOAL-104 not gövdesi için", () => {
  it("email mask'ler", async () => {
    const { PiiMasker } = await import("../../common/logging/pii-masker.js");
    const m = new PiiMasker();
    expect(m.maskString("İletişim: test@example.com")).toBe(
      "İletişim: ***@***",
    );
  });

  it("TCKN mask'ler (11 hane)", async () => {
    const { PiiMasker } = await import("../../common/logging/pii-masker.js");
    const m = new PiiMasker();
    expect(m.maskString("TCKN 12345678901 idi")).toBe("TCKN *** idi");
  });

  it("telefon mask'ler (10+ hane)", async () => {
    const { PiiMasker } = await import("../../common/logging/pii-masker.js");
    const m = new PiiMasker();
    expect(m.maskString("Ara: +90 555 123 4567 lütfen")).toContain("***");
  });

  it("IBAN mask'ler", async () => {
    const { PiiMasker } = await import("../../common/logging/pii-masker.js");
    const m = new PiiMasker();
    expect(m.maskString("IBAN: TR123456789012345678901234 idi")).toContain(
      "***",
    );
  });
});
