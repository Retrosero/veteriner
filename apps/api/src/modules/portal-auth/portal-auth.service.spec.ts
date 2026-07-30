/**
 * @file Portal auth service unit testleri.
 * @module apps/api/modules/portal-auth/portal-auth.service.spec
 *
 * @description Register, login, brute-force, session, logout ve
 * parola sıfırlama akışlarının temel senaryoları. Audit mock'lanır;
 * repository in-memory; bcryptjs gerçek (cost 12) çalışır.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditService } from "../../common/audit/audit.service.js";

import { PortalAuthRepository } from "./portal-auth.repository.js";
import { PortalAuthService } from "./portal-auth.service.js";

const TENANT = "tenant-abc-12345678";

function makeCtx() {
  return {
    ipAddress: "192.168.1.***",
    userAgentHash: "abcdef0123456789",
    correlationId: "req-test-001",
  };
}

function makeAuditStub() {
  return {
    record: vi
      .fn()
      .mockResolvedValue({ eventId: "evt-1", timestamp: new Date().toISOString() }),
  } as unknown as AuditService;
}

function makeRepo() {
  return new PortalAuthRepository();
}

async function makeTestPassword(): Promise<string> {
  // bcryptjs policy: min 12, küçük+büyük+rakam.
  return "TestPass1234!Strong";
}

describe("PortalAuthService", () => {
  let repo: PortalAuthRepository;
  let audit: AuditService;
  let service: PortalAuthService;

  beforeEach(() => {
    repo = makeRepo();
    audit = makeAuditStub();
    service = new PortalAuthService(repo, audit);
  });

  // ===========================================================================
  // REGISTER
  // ===========================================================================

  describe("register", () => {
    it("yeni portal user oluşturur + audit yayınlar", async () => {
      const password = await makeTestPassword();
      const user = await service.register(
        TENANT,
        {
          email: "owner1@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );

      expect(user.email).toBe("owner1@example.com");
      expect(user.status).toBe("active");
      expect(user.failedLoginCount).toBe(0);
      expect(audit.record).toHaveBeenCalled();
      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.register");
    });

    it("aynı email ile tekrar register → 409 VET-AUTH-0003", async () => {
      const password = await makeTestPassword();
      await service.register(
        TENANT,
        {
          email: "dupe@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      try {
        await service.register(
          TENANT,
          {
            email: "DUPE@example.com",
            password,
            ownerId: "22222222-2222-2222-2222-222222222222",
            consentKvkk: true,
          },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-AUTH-0003");
        expect(err.httpStatus).toBe(409);
      }
    });

    it("KVKK consent false → 422 VET-VALIDATION-0003", async () => {
      const password = await makeTestPassword();
      try {
        await service.register(
          TENANT,
          {
            email: "nokvkk@example.com",
            password,
            ownerId: "11111111-1111-1111-1111-111111111111",
            consentKvkk: false,
          },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-VALIDATION-0003");
        expect(err.httpStatus).toBe(422);
      }
    });
  });

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  describe("login", () => {
    async function seedUser() {
      const password = await makeTestPassword();
      const user = await service.register(
        TENANT,
        {
          email: "login@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      return { user, password };
    }

    it("doğru parola → user + session döner", async () => {
      const { user, password } = await seedUser();
      const result = await service.login(
        TENANT,
        { email: user.email, password },
        "192.168.1.1",
        "Mozilla/5.0",
      );
      expect(result.user.id).toBe(user.id);
      expect(result.session.token).toBeTruthy();
      expect(result.session.expiresAt).toBeTruthy();
      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.login.success");
    });

    it("yanlış parola → failedLoginCount++", async () => {
      const { user } = await seedUser();
      try {
        await service.login(
          TENANT,
          { email: user.email, password: "Wrong-Pass-1234" },
          "192.168.1.1",
          "Mozilla/5.0",
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0002");
      }
      const updated = repo.findPortalUserById(TENANT, user.id);
      expect(updated?.failedLoginCount).toBe(1);
    });

    it("5 yanlış deneme sonrası hesap kilitlenir (423 VET-AUTH-0005)", async () => {
      const { user } = await seedUser();
      // 4 yanlış deneme — kilitleme yok.
      for (let i = 0; i < 4; i += 1) {
        try {
          await service.login(
            TENANT,
            { email: user.email, password: "Wrong-Pass-1234" },
            "192.168.1.1",
            "Mozilla/5.0",
          );
        } catch {
          // 4. denemede generic 401.
        }
      }
      // 5. deneme → kilitleme.
      try {
        await service.login(
          TENANT,
          { email: user.email, password: "Wrong-Pass-1234" },
          "192.168.1.1",
          "Mozilla/5.0",
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect([err.errorCode, err.httpStatus]).toEqual([
          "VET-AUTH-0005",
          423,
        ]);
      }
      const updated = repo.findPortalUserById(TENANT, user.id);
      expect(updated?.status).toBe("locked");
      expect(updated?.lockedUntil).toBeTruthy();
    });

    it("kilitli hesapla login → 423 VET-AUTH-0005", async () => {
      const { user, password } = await seedUser();
      // Manuel olarak kilitle.
      const rec = repo.findPortalUserById(TENANT, user.id);
      if (!rec) throw new Error("user not seeded");
      repo.updatePortalUser({
        ...rec,
        status: "locked",
        lockedUntil: new Date(Date.now() + 60_000).toISOString(),
        failedLoginCount: 5,
      });
      try {
        await service.login(
          TENANT,
          { email: user.email, password },
          "192.168.1.1",
          "Mozilla/5.0",
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect([err.errorCode, err.httpStatus]).toEqual([
          "VET-AUTH-0005",
          423,
        ]);
      }
    });
  });

  // ===========================================================================
  // VALIDATE / LOGOUT
  // ===========================================================================

  describe("validateSession + logout", () => {
    it("valid token → user döner", async () => {
      const password = await makeTestPassword();
      const user = await service.register(
        TENANT,
        {
          email: "sess@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      const { session } = await service.login(
        TENANT,
        { email: user.email, password },
        "1.1.1.1",
        "ua",
      );
      const found = await service.validateSession(session.token);
      expect(found?.id).toBe(user.id);
    });

    it("invalid token → null", async () => {
      const found = await service.validateSession("not-a-real-token");
      expect(found).toBeNull();
    });

    it("logout → session silinir", async () => {
      const password = await makeTestPassword();
      const user = await service.register(
        TENANT,
        {
          email: "lo@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      const { session } = await service.login(
        TENANT,
        { email: user.email, password },
        "1.1.1.1",
        "ua",
      );
      await service.logout(session.token, makeCtx());
      const after = await service.validateSession(session.token);
      expect(after).toBeNull();
      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.logout");
    });
  });

  // ===========================================================================
  // PASSWORD RESET
  // ===========================================================================

  describe("password reset", () => {
    it("requestPasswordReset → token üretir + audit", async () => {
      const password = await makeTestPassword();
      await service.register(
        TENANT,
        {
          email: "reset@example.com",
          password,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      const res = await service.requestPasswordReset(
        TENANT,
        "reset@example.com",
        makeCtx(),
      );
      expect(res.resetToken).toBeTruthy();
      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.password.reset_request");
    });

    it("confirmPasswordReset → yeni parola set olur", async () => {
      const oldPwd = await makeTestPassword();
      const user = await service.register(
        TENANT,
        {
          email: "rs@example.com",
          password: oldPwd,
          ownerId: "11111111-1111-1111-1111-111111111111",
          consentKvkk: true,
        },
        makeCtx(),
      );
      const { resetToken } = await service.requestPasswordReset(
        TENANT,
        user.email,
        makeCtx(),
      );
      expect(resetToken).toBeTruthy();
      const newPwd = "Another-Strong-Pass-9876";
      await service.confirmPasswordReset(resetToken!, newPwd, makeCtx());

      // Yeni parola ile login olabilmeli.
      const result = await service.login(
        TENANT,
        { email: user.email, password: newPwd },
        "1.1.1.1",
        "ua",
      );
      expect(result.user.id).toBe(user.id);

      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.password.reset_success");
    });

    it("invalid reset token → 400 VET-AUTH-0004", async () => {
      try {
        await service.confirmPasswordReset(
          "definitely-not-a-valid-token",
          "NewPass-1234-Strong",
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect([err.errorCode, err.httpStatus]).toEqual([
          "VET-AUTH-0004",
          400,
        ]);
      }
    });
  });
});
