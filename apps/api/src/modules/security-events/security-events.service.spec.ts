/**
 * @file SecurityEventsService unit testleri.
 * @module apps/api/modules/security-events/security-events.service.spec
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları
 * service testleri.
 *   - recordSecurityEvent: fingerprint üretimi + occurrenceCount.
 *   - Default severity/errorCode (type'a göre) türetilir.
 *   - Critical olayda alarm adapter tetiklenir ve alertSent=true.
 *   - Tekrar critical event'te alarm adapter tekrar çağrılmaz.
 *   - Critical olmayan (warning/info/error) olaylarda alarm atlanır.
 *   - listSecurityEvents + getSecurityEventDetail: SUPERADMIN guard.
 *   - Non-SUPERADMIN → 403 VET-AUTHZ-0001.
 *   - getSecurityEventSummary: severity + type + topGroups.
 *   - recordClientSecurityEvent: tenant/branch/userId aktörden türetilir.
 *   - PII mask context'ten geçer.
 *   - moduleFromRoute SecurityEventModule türetir.
 *   - Alarm adapter hata fırlatırsa alertSent=false korunur.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { beforeEach, describe, expect, it } from "vitest";

import { SecurityEventsRepository } from "./security-events.repository.js";
import {
  SecurityEventsService,
  NoopSecurityAlertAdapter,
  type SecurityAlertAdapter,
  computeSecurityFingerprint,
  normalizeSecurityMessage,
  defaultErrorCodeForType,
  defaultSeverityForType,
} from "./security-events.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { SecurityEvent } from "@vetniva/contracts";

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

const PORTAL_USER_A: ActorContext = {
  actorId: "usr-portal-a",
  actorType: "portal_user",
  role: "PET_OWNER_PORTAL",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-portal-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeInput(
  overrides: Partial<
    Parameters<SecurityEventsService["recordSecurityEvent"]>[0]
  > = {},
): Parameters<SecurityEventsService["recordSecurityEvent"]>[0] {
  return {
    type: "failed_login",
    message: "Wrong password for usr-1",
    severity: "warning",
    module: "auth",
    route: "POST /api/v1/auth/login",
    ...overrides,
  };
}

class StubAlertAdapter implements SecurityAlertAdapter {
  public readonly name = "stub";
  public calls: SecurityEvent[] = [];
  public failNext = false;
  public async sendAlert(
    event: SecurityEvent,
  ): Promise<{ success: boolean; errorMessage?: string }> {
    this.calls.push(event);
    if (this.failNext) {
      return { success: false, errorMessage: "stub failure" };
    }
    return { success: true };
  }
}

class ThrowingAlertAdapter implements SecurityAlertAdapter {
  public readonly name = "throwing";
  public async sendAlert(): Promise<{
    success: boolean;
    errorMessage?: string;
  }> {
    throw new Error("adapter boom");
  }
}

describe("SecurityEventsService", () => {
  let service: SecurityEventsService;
  let repo: SecurityEventsRepository;
  let alert: StubAlertAdapter;

  beforeEach(() => {
    repo = new SecurityEventsRepository();
    alert = new StubAlertAdapter();
    service = new SecurityEventsService(repo, alert);
  });

  // -------------------------------------------------------------------------
  // recordSecurityEvent
  // -------------------------------------------------------------------------

  describe("recordSecurityEvent", () => {
    it("yeni güvenlik kaydı oluşturur", () => {
      const out = service.recordSecurityEvent(makeInput(), STAFF_A);
      expect(out.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(out.fingerprint).toHaveLength(16);
      expect(out.occurrenceCount).toBe(1);
      expect(out.tenantId).toBe(TENANT_A);
      expect(out.actorType).toBe("user");
      expect(out.country).toBe("TR");
    });

    it("aynı fingerprint için occurrenceCount artırılır", () => {
      const a = service.recordSecurityEvent(makeInput(), STAFF_A);
      const b = service.recordSecurityEvent(
        makeInput({ message: "Wrong password for usr-1" }),
        STAFF_A,
      );
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(b.occurrenceCount).toBe(2);
      expect(b.id).toBe(a.id);
    });

    it("default severity ve errorCode type'a göre türetilir", () => {
      // `severity` üretmek için bir helper: alanı optional yap.
      const noSeverity = {
        type: "failed_login" as const,
        message: "Wrong password for usr-1",
        module: "auth" as const,
        route: "POST /api/v1/auth/login",
      };
      const out = service.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        STAFF_A,
      );
      expect(out.severity).toBe("warning");
      expect(out.errorCode).toBe("VET-AUTH-0002");
    });

    it("tenant_isolation_breach_attempt default critical olur", () => {
      const noSeverity = {
        type: "tenant_isolation_breach_attempt" as const,
        message: "Cross-tenant access attempt",
        module: "tenant" as const,
        route: "POST /api/v1/tenant/x",
      };
      const out = service.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        STAFF_A,
      );
      expect(out.severity).toBe("critical");
      expect(out.errorCode).toBe("VET-TENANT-0002");
    });

    it("suspicious_export default error olur", () => {
      const noSeverity = {
        type: "suspicious_export" as const,
        message: "Büyük miktarda veri dışa aktarımı",
        module: "report" as const,
        route: "POST /api/v1/reports/export",
      };
      const out = service.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        STAFF_A,
      );
      expect(out.severity).toBe("error");
      expect(out.errorCode).toBe("VET-AUDIT-0002");
    });

    it("caller override ederse default yerine override kullanılır", () => {
      const out = service.recordSecurityEvent(
        makeInput({
          type: "failed_login",
          severity: "critical",
          errorCode: "VET-AUTH-9999",
        }),
        STAFF_A,
      );
      expect(out.severity).toBe("critical");
      expect(out.errorCode).toBe("VET-AUTH-9999");
    });

    it("critical + ilk kez → alarm adapter tetiklenir", async () => {
      // severity'yi default'a bırakmak için severity alanı olmayan input.
      const noSeverity = {
        type: "tenant_isolation_breach_attempt" as const,
        message: "Cross-tenant access attempt",
        module: "tenant" as const,
        route: "POST /api/v1/tenant/x",
      };
      const out = service.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        SUPERADMIN,
      );
      // fireAlert async; 10ms bekle yeterli.
      await new Promise((r) => setTimeout(r, 10));
      expect(alert.calls).toHaveLength(1);
      expect(alert.calls[0]!.id).toBe(out.id);
      const rec = repo.findById(out.id);
      expect(rec?.alertSent).toBe(true);
    });

    it("critical + tekrar → alarm adapter tekrar çağrılmaz", async () => {
      service.recordSecurityEvent(
        makeInput({ type: "tenant_isolation_breach_attempt" }),
        SUPERADMIN,
      );
      // fireAlert async olduğu için bir tick bekle.
      await new Promise((r) => setTimeout(r, 10));
      const before = alert.calls.length;
      service.recordSecurityEvent(
        makeInput({ type: "tenant_isolation_breach_attempt" }),
        SUPERADMIN,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(alert.calls.length).toBe(before);
    });

    it("warning/info/error olaylarda alarm adapter çağrılmaz", async () => {
      service.recordSecurityEvent(
        makeInput({ type: "failed_login", severity: "warning" }),
        STAFF_A,
      );
      service.recordSecurityEvent(
        makeInput({ type: "role_change", severity: "info" }),
        STAFF_A,
      );
      service.recordSecurityEvent(
        makeInput({ type: "suspicious_export", severity: "error" }),
        STAFF_A,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(alert.calls).toHaveLength(0);
    });

    it("alarm adapter success=false dönerse alertSent=false kalır", async () => {
      const failAlert = new StubAlertAdapter();
      failAlert.failNext = true;
      const failService = new SecurityEventsService(repo, failAlert);
      const noSeverity = {
        type: "tenant_isolation_breach_attempt" as const,
        message: "Cross-tenant access attempt",
        module: "tenant" as const,
        route: "POST /api/v1/tenant/x",
      };
      const out = failService.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        SUPERADMIN,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(failAlert.calls).toHaveLength(1);
      expect(out.alertSent).toBe(false);
    });

    it("alarm adapter throw ederse alertSent=false kalır", async () => {
      const throwingService = new SecurityEventsService(
        repo,
        new ThrowingAlertAdapter(),
      );
      const out = throwingService.recordSecurityEvent(
        makeInput({ type: "tenant_isolation_breach_attempt" }),
        SUPERADMIN,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(out.alertSent).toBe(false);
    });

    it("PII context'ten geçer (email mask'lı)", () => {
      const out = service.recordSecurityEvent(
        makeInput({
          type: "unauthorized_access_attempt",
          context: {
            email: "user@example.com",
            note: "Bu temiz not",
          },
        }),
        STAFF_A,
      );
      // email mask'lı olmalı; note dokunulmamalı.
      const ctx = out.context as Record<string, unknown>;
      const masked = typeof ctx["email"] === "string" ? ctx["email"] : "";
      expect(masked).not.toBe("user@example.com");
      expect(masked).toMatch(/\*\*\*/);
      expect(ctx["note"]).toBe("Bu temiz not");
    });

    it("portal_user actorType kayıtlanır", () => {
      const out = service.recordSecurityEvent(
        makeInput({ type: "failed_login" }),
        PORTAL_USER_A,
      );
      expect(out.actorType).toBe("portal_user");
    });

    it("modül caller override'ı kabul edilir", () => {
      const out = service.recordSecurityEvent(
        makeInput({ module: "rbac", route: "POST /api/v1/x" }),
        STAFF_A,
        "rbac",
      );
      expect(out.module).toBe("rbac");
    });

    it("modül route'tan türetilir (override yoksa)", () => {
      const out = service.recordSecurityEvent(
        makeInput({ module: undefined, route: "GET /api/v1/auth/session" }),
        STAFF_A,
      );
      expect(out.module).toBe("auth");
    });

    it("module yoksa ve route da yoksa 'unknown' döner", () => {
      const out = service.recordSecurityEvent(
        makeInput({ module: undefined, route: undefined }),
        STAFF_A,
      );
      expect(out.module).toBe("unknown");
    });

    it("istemci fingerprint override ederse o kullanılır", () => {
      const customFp = "a1b2c3d4e5f60718";
      const out = service.recordSecurityEvent(
        makeInput({ fingerprint: customFp }),
        STAFF_A,
      );
      expect(out.fingerprint).toBe(customFp);
    });

    it("errorCode override edilmezse defaultErrorCodeForType uygulanır", () => {
      expect(defaultErrorCodeForType("failed_login")).toBe("VET-AUTH-0002");
      expect(defaultErrorCodeForType("unauthorized_access_attempt")).toBe(
        "VET-AUTHZ-0002",
      );
      expect(defaultErrorCodeForType("suspicious_export")).toBe(
        "VET-AUDIT-0002",
      );
      expect(defaultErrorCodeForType("role_change")).toBe("VET-RBAC-0002");
      expect(defaultErrorCodeForType("tenant_isolation_breach_attempt")).toBe(
        "VET-TENANT-0002",
      );
    });

    it("defaultSeverityForType kataloğu tüm tipleri kapsar", () => {
      expect(defaultSeverityForType("failed_login")).toBe("warning");
      expect(defaultSeverityForType("unauthorized_access_attempt")).toBe(
        "warning",
      );
      expect(defaultSeverityForType("suspicious_export")).toBe("error");
      expect(defaultSeverityForType("role_change")).toBe("info");
      expect(defaultSeverityForType("tenant_isolation_breach_attempt")).toBe(
        "critical",
      );
    });
  });

  // -------------------------------------------------------------------------
  // listSecurityEvents
  // -------------------------------------------------------------------------

  describe("listSecurityEvents", () => {
    it("SUPERADMIN filtreli liste döner", async () => {
      service.recordSecurityEvent(makeInput({ type: "failed_login" }), STAFF_A);
      service.recordSecurityEvent(
        makeInput({ type: "suspicious_export" }),
        SUPERADMIN,
      );
      const res = await service.listSecurityEvents(
        { limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(2);
    });

    it("non-SUPERADMIN → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.listSecurityEvents({ limit: 50, offset: 0 }, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("type filtresi uygulanır", async () => {
      service.recordSecurityEvent(makeInput({ type: "failed_login" }), STAFF_A);
      service.recordSecurityEvent(
        makeInput({ type: "suspicious_export" }),
        SUPERADMIN,
      );
      const res = await service.listSecurityEvents(
        { type: "failed_login", limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.type).toBe("failed_login");
    });

    it("tenant filtresi uygulanır", async () => {
      service.recordSecurityEvent(
        makeInput({
          type: "failed_login",
          message: "Wrong password for staff-a",
        }),
        STAFF_A,
      );
      const tenantB: ActorContext = {
        ...STAFF_A,
        actorId: "usr-b",
        tenantId: TENANT_B,
        correlationId: "req-b",
      };
      service.recordSecurityEvent(
        makeInput({
          type: "failed_login",
          message: "Wrong password for staff-b",
        }),
        tenantB,
      );
      const res = await service.listSecurityEvents(
        { tenantId: TENANT_A, limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.tenantId).toBe(TENANT_A);
    });
  });

  // -------------------------------------------------------------------------
  // getSecurityEventDetail
  // -------------------------------------------------------------------------

  describe("getSecurityEventDetail", () => {
    it("SUPERADMIN tek olay detayı görür", async () => {
      const created = service.recordSecurityEvent(
        makeInput({ type: "failed_login" }),
        STAFF_A,
      );
      const detail = await service.getSecurityEventDetail(
        created.id,
        SUPERADMIN,
      );
      expect(detail.id).toBe(created.id);
      expect(detail.tenantId).toBe(TENANT_A);
    });

    it("non-SUPERADMIN → 403", async () => {
      const created = service.recordSecurityEvent(
        makeInput({ type: "failed_login" }),
        STAFF_A,
      );
      await expect(
        service.getSecurityEventDetail(created.id, STAFF_A),
      ).rejects.toBeInstanceOf(DomainError);
    });

    it("bilinmeyen id → 404 VET-AUDIT-0001", async () => {
      await expect(
        service.getSecurityEventDetail("sec-bad", SUPERADMIN),
      ).rejects.toMatchObject({
        errorCode: "VET-AUDIT-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // getSecurityEventSummary
  // -------------------------------------------------------------------------

  describe("getSecurityEventSummary", () => {
    it("severity × type + topGroups döner", async () => {
      service.recordSecurityEvent(
        makeInput({ type: "failed_login", severity: "warning" }),
        STAFF_A,
      );
      service.recordSecurityEvent(
        makeInput({ type: "failed_login", severity: "warning" }),
        SUPERADMIN,
      );
      service.recordSecurityEvent(
        makeInput({
          type: "tenant_isolation_breach_attempt",
          severity: "critical",
        }),
        SUPERADMIN,
      );
      const summary = await service.getSecurityEventSummary({}, SUPERADMIN);
      expect(summary.total).toBe(3);
      const warning = summary.bySeverity.find((b) => b.severity === "warning");
      expect(warning?.count).toBe(2);
      const critical = summary.bySeverity.find(
        (b) => b.severity === "critical",
      );
      expect(critical?.count).toBe(1);
      const failedLogin = summary.byType.find((b) => b.type === "failed_login");
      expect(failedLogin?.count).toBe(2);
      const breach = summary.byType.find(
        (b) => b.type === "tenant_isolation_breach_attempt",
      );
      expect(breach?.count).toBe(1);
      expect(summary.topGroups.length).toBeGreaterThan(0);
    });

    it("topGroups alertSent=true işaretler (critical)", async () => {
      const noSeverity = {
        type: "tenant_isolation_breach_attempt" as const,
        message: "Cross-tenant breach for summary",
        module: "tenant" as const,
        route: "POST /api/v1/tenant/y",
      };
      service.recordSecurityEvent(
        noSeverity as Parameters<
          SecurityEventsService["recordSecurityEvent"]
        >[0],
        SUPERADMIN,
      );
      // fireAlert async; alarm adapter'ın çalışması için bekle.
      await new Promise((r) => setTimeout(r, 10));
      const summary = await service.getSecurityEventSummary({}, SUPERADMIN);
      const breach = summary.topGroups.find(
        (g) => g.type === "tenant_isolation_breach_attempt",
      );
      expect(breach).toBeDefined();
      expect(breach!.alertSent).toBe(true);
    });

    it("non-SUPERADMIN → 403", async () => {
      await expect(
        service.getSecurityEventSummary({}, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
      });
    });
  });

  // -------------------------------------------------------------------------
  // recordClientSecurityEvent
  // -------------------------------------------------------------------------

  describe("recordClientSecurityEvent", () => {
    it("istemci tenant/branch/userId türetir", () => {
      const out = service.recordClientSecurityEvent(
        {
          type: "failed_login",
          message: "Form hatası: yanlış şifre",
          route: "/login",
        },
        STAFF_A,
      );
      expect(out.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(out.fingerprint).toHaveLength(16);
      // STAFF actor'undan türetilmiş olmalı.
      const rec = repo.all()[0]!;
      expect(rec.tenantId).toBe(TENANT_A);
      expect(rec.userId).toBe(STAFF_A.actorId);
      expect(rec.actorType).toBe("user");
    });

    it("default severity type'a göre türetilir", async () => {
      const out = service.recordClientSecurityEvent(
        {
          type: "tenant_isolation_breach_attempt",
          message: "Cross-tenant 403",
          route: "/x",
        },
        STAFF_A,
      );
      // fireAlert async; markAlertSent sonrası.
      await new Promise((r) => setTimeout(r, 10));
      const rec = repo.findById(out.id);
      expect(rec?.alertSent).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Fingerprint & normalize
  // -------------------------------------------------------------------------

  describe("fingerprint & normalize", () => {
    it("normalizeSecurityMessage UUID ve sayı mask'ler", () => {
      const out = normalizeSecurityMessage(
        "Failed 3 attempts for user 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      );
      expect(out).toContain("<uuid>");
      expect(out).toContain("<n>");
      expect(out).not.toContain("9b1deb4d");
    });

    it("computeSecurityFingerprint aynı girdi için aynı çıktı", () => {
      const a = computeSecurityFingerprint("failed_login", "auth", "msg");
      const b = computeSecurityFingerprint("failed_login", "auth", "msg");
      expect(a).toBe(b);
      expect(a).toHaveLength(16);
    });

    it("computeSecurityFingerprint farklı type için farklı sonuç", () => {
      const a = computeSecurityFingerprint("failed_login", "auth", "msg");
      const b = computeSecurityFingerprint(
        "unauthorized_access_attempt",
        "auth",
        "msg",
      );
      expect(a).not.toBe(b);
    });
  });

  // -------------------------------------------------------------------------
  // Repository clear
  // -------------------------------------------------------------------------

  describe("repository", () => {
    it("clear tüm state'i temizler", () => {
      service.recordSecurityEvent(makeInput(), STAFF_A);
      repo.clear();
      expect(repo.all()).toHaveLength(0);
    });
  });
});

describe("NoopSecurityAlertAdapter", () => {
  it("success=true döner (default)", async () => {
    const a = new NoopSecurityAlertAdapter();
    const out = await a.sendAlert({
      id: "sec-1",
      fingerprint: "0000000000000000",
      requestId: "req-1",
      tenantId: null,
      branchId: null,
      userId: null,
      actorType: "system",
      type: "failed_login",
      module: "auth",
      route: "POST /api/v1/auth/login",
      release: "0.0.0",
      severity: "critical",
      errorCode: null,
      message: "x",
      statusCode: null,
      ipAddress: null,
      userAgentHash: null,
      context: {},
      country: "SYSTEM",
      occurredAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      occurrenceCount: 1,
      alertSent: false,
    });
    expect(out.success).toBe(true);
  });
});
