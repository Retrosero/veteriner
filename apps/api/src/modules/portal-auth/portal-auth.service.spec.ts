/**
 * @file Portal auth service unit testleri.
 * @module apps/api/modules/portal-auth/portal-auth.service.spec
 *
 * @description Register, davet üzerinden register, login, brute-
 * force, session, logout, parola sıfırlama ve email doğrulama
 * akışlarının temel senaryoları. Audit mock'lanır; repository
 * in-memory; bcryptjs gerçek (cost 12) çalışır. PortalService
 * (davet çözümlemesi) minimal stub olarak inject edilir.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalAuthRepository } from "./portal-auth.repository.js";
import { PortalAuthService } from "./portal-auth.service.js";
import { type AuditService } from "../../common/audit/audit.service.js";
import { type PortalService } from "../portal/portal.service.js";

import type { PortalInvitation } from "../../common/portal/portal.types.js";

const TENANT = "tenant-abc-12345678";
const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "22222222-2222-2222-2222-222222222222";

function makeCtx() {
  return {
    ipAddress: "192.168.1.***",
    userAgentHash: "abcdef0123456789",
    correlationId: "req-test-001",
  };
}

function makeAuditStub() {
  return {
    record: vi.fn().mockResolvedValue({
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
    }),
  } as unknown as AuditService;
}

function makeRepo() {
  return new PortalAuthRepository();
}

function makePortalStub() {
  // Basit in-memory davet store. Davet oluşturmak için
  // `__seedInvitation` çağrılır.
  const invByToken = new Map<string, PortalInvitation>();
  const acceptedIds = new Set<string>();
  return {
    __seedInvitation: (inv: PortalInvitation) => {
      invByToken.set(inv.invitationToken, inv);
    },
    findInvitationByToken: vi.fn((token: string) => {
      return invByToken.get(token) ?? null;
    }),
    markInvitationAccepted: vi.fn((id: string) => {
      acceptedIds.add(id);
    }),
  } as unknown as PortalService & {
    __seedInvitation: (inv: PortalInvitation) => void;
  };
}

async function makeTestPassword(): Promise<string> {
  // bcryptjs policy: min 12, küçük+büyük+rakam.
  return "TestPass1234!Strong";
}

function makePendingInvitation(
  token: string,
  overrides?: Partial<PortalInvitation>,
): PortalInvitation {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: `pinv-test-${token.slice(0, 8)}`,
    tenantId: TENANT,
    ownerId: OWNER_ID,
    email: "invitee@example.com",
    status: "pending",
    invitedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    invitationToken: token,
    patientIds: [PATIENT_ID],
    locale: "tr-TR",
    invitedBy: "99999999-9999-9999-9999-999999999999",
    ...overrides,
  };
}

describe("PortalAuthService", () => {
  let repo: PortalAuthRepository;
  let audit: AuditService;
  let portal: ReturnType<typeof makePortalStub>;
  let service: PortalAuthService;

  beforeEach(() => {
    repo = makeRepo();
    audit = makeAuditStub();
    portal = makePortalStub();
    service = new PortalAuthService(
      repo,
      audit,
      portal as unknown as PortalService,
    );
  });

  // ===========================================================================
  // REGISTER
  // ===========================================================================

  describe("register", () => {
    it("yeni portal user oluşturur + email verification token üretir", async () => {
      const password = await makeTestPassword();
      const result = await service.register(
        TENANT,
        {
          email: "owner1@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );

      // Service artık { user, emailVerificationToken } döner.
      const user = "user" in result ? result.user : result;
      const evToken =
        "emailVerificationToken" in result
          ? result.emailVerificationToken
          : undefined;

      expect(user.email).toBe("owner1@example.com");
      expect(user.status).toBe("active");
      expect(user.failedLoginCount).toBe(0);
      expect(evToken).toBeTruthy();
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
          ownerId: OWNER_ID,
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
            ownerId: OWNER_ID,
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
  // DAVET ÜZERİNDEN KAYIT (GOAL-033)
  // ===========================================================================

  describe("registerByInvitation", () => {
    const TOKEN = "abcdef0123456789abcdef0123456789";

    it("geçerli davet + parola → portal user oluşturur + davet accepted", async () => {
      portal.__seedInvitation(makePendingInvitation(TOKEN));
      const password = await makeTestPassword();
      const result = await service.registerByInvitation(
        TOKEN,
        password,
        {
          email: "invitee@example.com",
          consentKvkk: true,
          displayName: "Ayşe Yılmaz",
        },
        makeCtx(),
      );

      expect(result.user.email).toBe("invitee@example.com");
      expect(result.user.ownerId).toBe(OWNER_ID);
      expect(result.user.status).toBe("active");
      expect(result.emailVerificationToken).toBeTruthy();

      // Davet accepted işaretlendi.
      expect(
        (portal.markInvitationAccepted as ReturnType<typeof vi.fn>).mock.calls
          .length,
      ).toBe(1);

      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.register_by_invitation");
    });

    it("geçersiz davet token → 410 VET-PORTAL-0001", async () => {
      const password = await makeTestPassword();
      try {
        await service.registerByInvitation(
          "non-existent-token-value-1234567890",
          password,
          { email: "x@example.com", consentKvkk: true },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-PORTAL-0001");
        expect(err.httpStatus).toBe(410);
      }
    });

    it("expired davet → 410 VET-PORTAL-0001", async () => {
      const expiredToken = "expired0000000000000000000000000";
      const now = new Date();
      portal.__seedInvitation(
        makePendingInvitation(expiredToken, {
          status: "expired",
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
        }),
      );
      const password = await makeTestPassword();
      try {
        await service.registerByInvitation(
          expiredToken,
          password,
          { email: "x@example.com", consentKvkk: true },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string };
        expect(err.errorCode).toBe("VET-PORTAL-0001");
      }
    });

    it("KVKK consent false → 422 VET-VALIDATION-0003", async () => {
      portal.__seedInvitation(makePendingInvitation(TOKEN));
      const password = await makeTestPassword();
      try {
        await service.registerByInvitation(
          TOKEN,
          password,
          { email: "x@example.com", consentKvkk: false },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string };
        expect(err.errorCode).toBe("VET-VALIDATION-0003");
      }
    });

    it("aynı email ile kayıt varsa → 409 VET-AUTH-0003", async () => {
      const password = await makeTestPassword();
      await service.register(
        TENANT,
        {
          email: "taken@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      portal.__seedInvitation(
        makePendingInvitation(TOKEN, { email: "taken@example.com" }),
      );
      try {
        await service.registerByInvitation(
          TOKEN,
          password,
          { email: "TAKEN@example.com", consentKvkk: true },
          makeCtx(),
        );
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-AUTH-0003");
        expect(err.httpStatus).toBe(409);
      }
    });
  });

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  describe("login", () => {
    async function seedUser() {
      const password = await makeTestPassword();
      const result = await service.register(
        TENANT,
        {
          email: "login@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      return { user: "user" in result ? result.user : result, password };
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
        expect([err.errorCode, err.httpStatus]).toEqual(["VET-AUTH-0005", 423]);
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
        expect([err.errorCode, err.httpStatus]).toEqual(["VET-AUTH-0005", 423]);
      }
    });
  });

  // ===========================================================================
  // VALIDATE / LOGOUT
  // ===========================================================================

  describe("validateSession + logout", () => {
    async function seedAndLogin() {
      const password = await makeTestPassword();
      const reg = await service.register(
        TENANT,
        {
          email: "sess@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const user = "user" in reg ? reg.user : reg;
      const { session } = await service.login(
        TENANT,
        { email: user.email, password },
        "1.1.1.1",
        "ua",
      );
      return { user, session };
    }

    it("valid token → user döner", async () => {
      const { user, session } = await seedAndLogin();
      const found = await service.validateSession(session.token);
      expect(found?.id).toBe(user.id);
    });

    it("invalid token → null", async () => {
      const found = await service.validateSession("not-a-real-token");
      expect(found).toBeNull();
    });

    it("logout → session silinir", async () => {
      const { session } = await seedAndLogin();
      await service.logout(session.token, makeCtx());
      const after = await service.validateSession(session.token);
      expect(after).toBeNull();
      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.logout");
    });

    it("getSessionMeta → expiresAt + tenantId döner", async () => {
      const { session, user } = await seedAndLogin();
      const meta = await service.getSessionMeta(session.token);
      expect(meta?.tenantId).toBe(TENANT);
      expect(meta?.portalUserId).toBe(user.id);
      expect(meta?.expiresAt).toBeTruthy();
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
          ownerId: OWNER_ID,
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
      const reg = await service.register(
        TENANT,
        {
          email: "rs@example.com",
          password: oldPwd,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const user = "user" in reg ? reg.user : reg;
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
        expect([err.errorCode, err.httpStatus]).toEqual(["VET-AUTH-0004", 400]);
      }
    });
  });

  // ===========================================================================
  // EMAIL DOĞRULAMA (GOAL-033)
  // ===========================================================================

  describe("email doğrulama", () => {
    it("register sonrası verifyEmail → emailVerified=true", async () => {
      const password = await makeTestPassword();
      const reg = await service.register(
        TENANT,
        {
          email: "verify@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const user = "user" in reg ? reg.user : reg;
      const evToken = reg.emailVerificationToken;
      expect(evToken).toBeTruthy();

      const result = await service.verifyEmail(evToken!, makeCtx());
      expect(result.email).toBe("verify@example.com");

      const updated = repo.findPortalUserById(TENANT, user.id);
      expect(updated?.emailVerified).toBe(true);
      expect(updated?.emailVerifiedAt).toBeTruthy();

      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.email.verified");
    });

    it("invalid token → 400 VET-AUTH-0004", async () => {
      try {
        await service.verifyEmail("not-a-real-token-1234567890", makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect([err.errorCode, err.httpStatus]).toEqual(["VET-AUTH-0004", 400]);
      }
    });

    it("token ikinci kez kullanılırsa → 400 VET-AUTH-0004 (tek seferlik)", async () => {
      const password = await makeTestPassword();
      const reg = await service.register(
        TENANT,
        {
          email: "twice@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const evToken = reg.emailVerificationToken!;
      await service.verifyEmail(evToken, makeCtx());
      try {
        await service.verifyEmail(evToken, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string };
        expect(err.errorCode).toBe("VET-AUTH-0004");
      }
    });

    it("issueEmailVerificationToken → yeni token üretir", async () => {
      const password = await makeTestPassword();
      const reg = await service.register(
        TENANT,
        {
          email: "reissue@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const user = "user" in reg ? reg.user : reg;
      // İlk token'ı tüketmeden yeni bir token talep et (eski geçersiz olur).
      const reissue = await service.issueEmailVerificationToken(
        TENANT,
        user.id,
        makeCtx(),
      );
      expect(reissue.emailVerificationToken).toBeTruthy();

      // Eski token artık geçersiz olmalı (revokeAllEmailVerifications).
      try {
        await service.verifyEmail(reg.emailVerificationToken!, makeCtx());
        expect.fail("Eski token artık geçersiz olmalıydı");
      } catch (e) {
        const err = e as { errorCode: string };
        expect(err.errorCode).toBe("VET-AUTH-0004");
      }

      const events = (audit.record as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => (c[0] as { eventName: string }).eventName,
      );
      expect(events).toContain("audit:portal.auth.email.verification_request");
    });

    it("zaten doğrulanmış kullanıcı için reissue → 422 VET-VALIDATION-0003", async () => {
      const password = await makeTestPassword();
      const reg = await service.register(
        TENANT,
        {
          email: "already@example.com",
          password,
          ownerId: OWNER_ID,
          consentKvkk: true,
        },
        makeCtx(),
      );
      const user = "user" in reg ? reg.user : reg;
      // Email'i doğrula.
      await service.verifyEmail(reg.emailVerificationToken!, makeCtx());

      try {
        await service.issueEmailVerificationToken(TENANT, user.id, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string };
        expect(err.errorCode).toBe("VET-VALIDATION-0003");
      }
    });
  });
});
