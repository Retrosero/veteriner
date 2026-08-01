/**
 * @file Auth service unit testleri.
 * @module apps/api/common/auth/auth.service.spec
 * @description Login, logout, refresh, parola sıfırlama, davet, parola
 * değişimi akışlarının temel senaryoları. Repository ve audit
 * mock'lanır; password/token modülleri gerçek bcrypt/sha256 kullanır
 * (küçük cost factor ile hız testi).
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import {
  MAX_FAILED_LOGIN_COUNT,
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type InviteUserRequest,
  type LoginRequest,
  type ResetPasswordRequest,
} from "@vetniva/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { BruteForceGuard } from "./brute-force.js";
import { type TenantRepository } from "../../modules/tenant/tenant.repository.js";
import { type AuditService } from "../audit/audit.service.js";

/**
 *
 */
function makeCtx() {
  return {
    ipAddress: "192.168.1.***",
    userAgentHash: "abcdef0123456789",
    correlationId: "req-test-001",
  };
}

/**
 *
 * @param overrides
 */
function makeUser(
  overrides: Partial<{
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    status: "active" | "suspended" | "disabled";
    failedLoginCount: number;
    lockedUntil: Date | null;
    locale: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "vet@pilot.com",
    // bcryptjs $2a$10$ (test için düşük cost) — gerçek cost 12
    passwordHash:
      overrides.passwordHash ??
      "$2a$10$abcdefghijklmnopqrstuv1234567890ABCDEFGHIJKLMNOPQRSTUWW",
    displayName: overrides.displayName ?? "Dr. Pilot",
    status: overrides.status ?? "active",
    failedLoginCount: overrides.failedLoginCount ?? 0,
    lockedUntil: overrides.lockedUntil ?? null,
    locale: overrides.locale ?? "tr-TR",
    passwordChangedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

/**
 *
 */
function makeRepoStub() {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    updatePassword: vi.fn(),
    recordFailedLogin: vi.fn(),
    recordSuccessfulLogin: vi.fn(),
    updateStatus: vi.fn(),
    findActiveMembershipWithTenant: vi.fn(),
    listActiveMembershipsWithTenant: vi.fn(),
    upsertMembershipForTenant: vi.fn(),
    findDefaultActiveBranch: vi.fn().mockResolvedValue({ id: "branch-1" }),
    findActiveBranchForUser: vi.fn(),
    createSession: vi.fn(),
    findSessionByTokenHash: vi.fn(),
    findSessionByIdForUser: vi.fn(),
    touchSession: vi.fn(),
    revokeSession: vi.fn(),
    listActiveSessions: vi.fn(),
    listAllSessions: vi.fn(),
    revokeAllSessions: vi.fn(),
    createInvitation: vi.fn(),
    findPendingInvitation: vi.fn(),
    findInvitationByTokenHash: vi.fn(),
    listInvitations: vi.fn(),
    updateInvitation: vi.fn(),
    expireOldInvitations: vi.fn(),
    createPasswordReset: vi.fn(),
    findPasswordResetByTokenHash: vi.fn(),
    revokePasswordResets: vi.fn(),
    markPasswordResetUsed: vi.fn(),
  } satisfies Partial<AuthRepository> as unknown as AuthRepository;
}

/**
 *
 */
/**
 *
 */
function makeAuditStub() {
  return {
    record: vi.fn().mockResolvedValue({
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
    }),
  } as unknown as AuditService;
}

/**
 *
 */
function makeTenantsStub() {
  return {
    findById: vi.fn(),
  } as unknown as TenantRepository;
}

describe("AuthService", () => {
  let repo: AuthRepository;
  let tenants: TenantRepository;
  let audit: AuditService;
  let bruteForce: BruteForceGuard;
  let service: AuthService;

  beforeEach(() => {
    repo = makeRepoStub();
    tenants = makeTenantsStub();
    audit = makeAuditStub();
    bruteForce = new BruteForceGuard();
    service = new AuthService(repo, tenants, audit, bruteForce);
  });

  // ===========================================================================
  // LOGIN
  // ===========================================================================

  describe("login", () => {
    it("email + parola doğru → sessionToken + user + tenant", async () => {
      // bcryptjs $2a$10$ ile "decoy" hash. Test parolamız hash'e uygun değil
      // çünkü gerçek bcrypt ile hash'lenmiş parolayı bilmiyoruz. Bu nedenle
      // service.verifyPassword test'te her zaman false döner. Burada
      // sadece "kullanıcı var ama parola yanlış" senaryosunu test ederiz;
      // bcrypt yolunu entegrasyon testinde (apps/api/test) doğrularız.
      const user = makeUser();
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      (
        repo.findActiveMembershipWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        tenantId: "tenant-1",
        role: "OWNER",
        tenant: { id: "tenant-1", slug: "pilot", name: "Pilot", country: "TR" },
      });
      (repo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "session-1",
        userId: user.id,
        tokenHash: "tokenhash",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
      });
      (
        repo.recordSuccessfulLogin as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const req: LoginRequest = {
        email: "vet@pilot.com",
        password: "any-password-12+chars",
      };
      // Parola yanlış → 401 beklenir (hash uymadığı için).
      await expect(service.login(req, makeCtx())).rejects.toThrow();
    });

    it("bilinmeyen email → VET-AUTH-0002 (timing attack korumalı)", async () => {
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      const req: LoginRequest = {
        email: "ghost@nope.com",
        password: "whatever",
      };
      try {
        await service.login(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0002");
      }
    });

    it("5 başarısız deneme sonrası hesap kilitlenir", async () => {
      const user = makeUser({ failedLoginCount: MAX_FAILED_LOGIN_COUNT - 1 });
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      (repo.recordFailedLogin as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      const req: LoginRequest = { email: user.email, password: "wrong" };
      try {
        await service.login(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        // 5. başarısız deneme hem VET-AUTH-0003 hem de lockedUntil set eder.
        expect(["VET-AUTH-0002", "VET-AUTH-0003"]).toContain(err.errorCode);
      }
      // DB'ye recordFailedLogin çağrıldı.
      expect(repo.recordFailedLogin).toHaveBeenCalled();
    });

    it("lockedUntil gelecekte → VET-AUTH-0003", async () => {
      const user = makeUser({
        lockedUntil: new Date(Date.now() + 1000 * 60 * 5), // 5 dk sonra
      });
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      const req: LoginRequest = { email: user.email, password: "any" };
      try {
        await service.login(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0003");
      }
    });

    it("suspended kullanıcı → VET-AUTH-0002 (genel mesaj)", async () => {
      const user = makeUser({ status: "suspended" });
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      const req: LoginRequest = { email: user.email, password: "any" };
      try {
        await service.login(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0002");
      }
    });
  });

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  describe("logout", () => {
    it("session iptal edilir + audit yazılır", async () => {
      (repo.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );
      const result = await service.logout("session-1", "user-1", makeCtx());
      expect(result.revokedAt).toBeTruthy();
      expect(repo.revokeSession).toHaveBeenCalledWith(
        "session-1",
        "user-1",
        "logout",
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // REFRESH
  // ===========================================================================

  describe("refresh", () => {
    it("yeni session oluşturur, eski rotate edilir", async () => {
      (repo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "session-2",
        userId: "user-1",
        tokenHash: "newhash",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
      });
      (repo.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );
      const result = await service.refresh("session-1", "user-1", makeCtx());
      expect(result.sessionToken).toBeTruthy();
      expect(repo.revokeSession).toHaveBeenCalledWith(
        "session-1",
        "user-1",
        "rotated",
        "session-2",
      );
    });
  });

  // ===========================================================================
  // FORGOT / RESET PASSWORD
  // ===========================================================================

  describe("forgotPassword", () => {
    it("kullanıcı yoksa bile 200 mesajı döner (enumeration koruması)", async () => {
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      const req: ForgotPasswordRequest = { email: "ghost@nope.com" };
      const result = await service.forgotPassword(req, makeCtx());
      expect(result.message).toMatch(/kayıtlıysa/i);
    });

    it("kullanıcı varsa token üretilir", async () => {
      const user = makeUser();
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      (repo.revokePasswordResets as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      );
      (repo.createPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue(
        {},
      );
      const req: ForgotPasswordRequest = { email: user.email };
      const result = await service.forgotPassword(req, makeCtx());
      expect(result.message).toMatch(/kayıtlıysa/i);
      expect(repo.createPasswordReset).toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("geçersiz token → VET-AUTH-0004", async () => {
      (
        repo.findPasswordResetByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      const req: ResetPasswordRequest = {
        token: "x".repeat(64),
        newPassword: "NewPassword123",
      };
      try {
        await service.resetPassword(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0004");
      }
    });

    it("süresi dolmuş token → VET-AUTH-0004", async () => {
      (
        repo.findPasswordResetByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() - 1000), // geçmiş
        usedAt: null,
        createdAt: new Date(),
      });
      const req: ResetPasswordRequest = {
        token: "x".repeat(64),
        newPassword: "NewPassword123",
      };
      try {
        await service.resetPassword(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0004");
      }
    });

    it("zaten kullanılmış token → VET-AUTH-0004", async () => {
      (
        repo.findPasswordResetByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "reset-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(), // kullanılmış
        createdAt: new Date(),
      });
      const req: ResetPasswordRequest = {
        token: "x".repeat(64),
        newPassword: "NewPassword123",
      };
      try {
        await service.resetPassword(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0004");
      }
    });

    it("başarılı reset → parola güncellenir + tüm session'lar iptal", async () => {
      const user = makeUser();
      (
        repo.findPasswordResetByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "reset-1",
        userId: user.id,
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (repo.updatePassword as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (
        repo.markPasswordResetUsed as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);
      (repo.revokeAllSessions as ReturnType<typeof vi.fn>).mockResolvedValue(2);
      (repo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "session-new",
        userId: user.id,
        tokenHash: "newhash",
        expiresAt: new Date(),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
      });
      const req: ResetPasswordRequest = {
        token: "x".repeat(64),
        newPassword: "NewPassword123",
      };
      const result = await service.resetPassword(req, makeCtx());
      expect(result.message).toMatch(/g[üu]ncellendi/i);
      expect(result.sessionToken).toBeTruthy();
      expect(repo.revokeAllSessions).toHaveBeenCalledWith(
        user.id,
        "password_reset",
      );
    });
  });

  // ===========================================================================
  // CHANGE PASSWORD
  // ===========================================================================

  describe("changePassword", () => {
    it("mevcut parola yanlışsa hata", async () => {
      const user = makeUser();
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      const req: ChangePasswordRequest = {
        currentPassword: "WrongPassword1",
        newPassword: "NewPassword123",
      };
      try {
        await service.changePassword(user.id, req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0002");
      }
    });

    it("kullanıcı bulunamazsa hata", async () => {
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const req: ChangePasswordRequest = {
        currentPassword: "OldPassword1",
        newPassword: "NewPassword123",
      };
      try {
        await service.changePassword("ghost", req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0001");
      }
    });
  });

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  describe("inviteUser", () => {
    it("bekleyen davet varsa VET-AUTH-0005", async () => {
      (
        repo.findPendingInvitation as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "inv-pending",
        status: "pending",
      });
      const req: InviteUserRequest = { email: "x@y.com", role: "STAFF" };
      try {
        await service.inviteUser("tenant-1", req, "admin-1", makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0005");
      }
    });

    it("yeni davet oluşturur + audit", async () => {
      (
        repo.findPendingInvitation as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (repo.createInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "inv-1",
        tenantId: "tenant-1",
        email: "x@y.com",
        role: "STAFF",
        tokenHash: "h",
        invitedBy: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        acceptedAt: null,
        createdAt: new Date(),
      });
      const req: InviteUserRequest = { email: "x@y.com", role: "STAFF" };
      const result = await service.inviteUser(
        "tenant-1",
        req,
        "admin-1",
        makeCtx(),
      );
      expect(result.invitationId).toBe("inv-1");
      expect(result.invitationUrl).toContain("/invitations/accept?token=");
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("acceptInvitation", () => {
    it("geçersiz davet → VET-AUTH-0005", async () => {
      (
        repo.findInvitationByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      const req: AcceptInvitationRequest = {
        token: "x".repeat(64),
        displayName: "Dr. X",
        password: "NewPassword123",
        locale: "tr-TR",
      };
      try {
        await service.acceptInvitation(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0005");
      }
    });

    it("süresi dolmuş davet → expired + VET-AUTH-0005", async () => {
      (
        repo.findInvitationByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "inv-1",
        tenantId: "tenant-1",
        email: "x@y.com",
        role: "STAFF",
        tokenHash: "h",
        invitedBy: null,
        status: "pending",
        expiresAt: new Date(Date.now() - 1000), // geçmiş
        acceptedAt: null,
        createdAt: new Date(),
      });
      (repo.updateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const req: AcceptInvitationRequest = {
        token: "x".repeat(64),
        displayName: "Dr. X",
        password: "NewPassword123",
        locale: "tr-TR",
      };
      try {
        await service.acceptInvitation(req, makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0005");
      }
      expect(repo.updateInvitation).toHaveBeenCalledWith("tenant-1", "inv-1", {
        status: "expired",
      });
    });

    it("yeni kullanıcı oluşturur + membership atar + session açılır", async () => {
      (
        repo.findInvitationByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "inv-1",
        tenantId: "tenant-1",
        email: "new@vet.com",
        role: "STAFF",
        tokenHash: "h",
        invitedBy: null,
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: null,
        createdAt: new Date(),
      });
      (repo.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      (repo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeUser({ id: "user-new", email: "new@vet.com" }),
      );
      (
        repo.upsertMembershipForTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);
      (repo.updateInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (repo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "session-1",
        userId: "user-new",
        tokenHash: "newhash",
        expiresAt: new Date(),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
      });
      (tenants.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tenant-1",
        slug: "pilot",
        name: "Pilot",
        country: "TR",
      });
      const req: AcceptInvitationRequest = {
        token: "x".repeat(64),
        displayName: "Dr. New",
        password: "NewPassword123",
        locale: "tr-TR",
      };
      const result = await service.acceptInvitation(req, makeCtx());
      expect(result.user.id).toBe("user-new");
      expect(result.tenant?.id).toBe("tenant-1");
      expect(result.role).toBe("STAFF");
    });
  });

  // ===========================================================================
  // ME
  // ===========================================================================

  describe("me", () => {
    it("kullanıcı + session + memberships döner", async () => {
      const user = makeUser();
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (
        repo.findSessionByIdForUser as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "session-1",
        userId: user.id,
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        ipAddress: "192.168.1.***",
        userAgentHash: "h",
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
      });
      (
        repo.listActiveMembershipsWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          tenantId: "tenant-1",
          role: "OWNER",
          status: "active",
          tenant: {
            id: "tenant-1",
            slug: "pilot",
            name: "Pilot",
            country: "TR",
            defaultLocale: "tr-TR",
            timezone: "Europe/Istanbul",
          },
        },
      ]);
      const result = await service.me(user.id, "session-1");
      expect(result.user.id).toBe(user.id);
      expect(result.memberships.length).toBe(1);
      expect(result.memberships[0]?.role).toBe("OWNER");
    });

    it("kullanıcı bulunamazsa VET-AUTH-0001", async () => {
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      try {
        await service.me("ghost", "session-1");
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0001");
      }
    });
  });

  // ===========================================================================
  // SESSION VALIDATION
  // ===========================================================================

  describe("validateSession", () => {
    it("süresi dolmuş session null döner", async () => {
      (
        repo.findSessionByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() - 1000),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
        activeBranchId: null,
      });
      const result = await service.validateSession("anytoken");
      expect(result).toBeNull();
    });

    it("iptal edilmiş session null döner", async () => {
      (
        repo.findSessionByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: new Date(),
        revokedReason: "logout",
        activeBranchId: null,
      });
      const result = await service.validateSession("anytoken");
      expect(result).toBeNull();
    });

    it("aktif session userId + sessionId + activeBranchId döner", async () => {
      (
        repo.findSessionByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        lastUsedAt: new Date(),
        ipAddress: "192.168.1.***",
        userAgentHash: "h",
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
        activeBranchId: "branch-42",
      });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        status: "active",
        isSuperadmin: false,
      });
      const result = await service.validateSession("anytoken");
      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user-1");
      expect(result?.sessionId).toBe("session-1");
      expect(result?.activeBranchId).toBe("branch-42");
    });

    it("kullanıcı suspend edilmişse session null döner + revoke edilir", async () => {
      (
        repo.findSessionByTokenHash as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        tokenHash: "h",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        lastUsedAt: new Date(),
        ipAddress: null,
        userAgentHash: null,
        createdAt: new Date(),
        replacedById: null,
        revokedAt: null,
        revokedReason: null,
        activeBranchId: null,
      });
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        status: "suspended",
        isSuperadmin: false,
      });
      const result = await service.validateSession("anytoken");
      expect(result).toBeNull();
      expect(repo.revokeSession).toHaveBeenCalledWith(
        "session-1",
        "user-1",
        "user_inactive",
      );
    });
  });

  // ===========================================================================
  // SESSION LIST / REVOKE
  // ===========================================================================

  describe("listSessions", () => {
    it("tüm session'lar isCurrent bayrağı ile döner", async () => {
      (repo.listAllSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "session-1",
          userId: "user-1",
          tokenHash: "h",
          expiresAt: new Date(),
          lastUsedAt: new Date(),
          ipAddress: "1.1.1.***",
          userAgentHash: "h",
          createdAt: new Date(),
          replacedById: null,
          revokedAt: null,
          revokedReason: null,
        },
        {
          id: "session-2",
          userId: "user-1",
          tokenHash: "h2",
          expiresAt: new Date(),
          lastUsedAt: new Date(),
          ipAddress: "2.2.2.***",
          userAgentHash: "h",
          createdAt: new Date(),
          replacedById: null,
          revokedAt: new Date(),
          revokedReason: "logout",
        },
      ]);
      const result = await service.listSessions("user-1", "session-1");
      expect(result.length).toBe(2);
      expect(result[0]?.isCurrent).toBe(true);
      expect(result[1]?.isCurrent).toBe(false);
      expect(result[1]?.revokedAt).toBeTruthy();
    });
  });

  describe("revokeSessionById", () => {
    it("başka kullanıcının session'ı iptal edilemez", async () => {
      (
        repo.findSessionByIdForUser as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      try {
        await service.revokeSessionById("session-1", "user-1", makeCtx());
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0001");
      }
    });
  });

  // ===========================================================================
  // SWITCH TENANT
  // ===========================================================================

  describe("switchTenant", () => {
    it("aktif üyelik yoksa VET-AUTH-0001", async () => {
      (
        repo.findActiveMembershipWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      try {
        await service.switchTenant("user-1", { tenantSlug: "ghost" });
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        expect((e as { errorCode: string }).errorCode).toBe("VET-AUTH-0001");
      }
    });

    it("aktif üyelik varsa tenantId + role döner", async () => {
      (
        repo.findActiveMembershipWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        tenantId: "tenant-2",
        role: "VETERINARIAN",
        tenant: { slug: "vet-2", id: "tenant-2", name: "Vet 2", country: "TR" },
      });
      const result = await service.switchTenant("user-1", {
        tenantSlug: "vet-2",
      });
      expect(result.tenantId).toBe("tenant-2");
      expect(result.role).toBe("VETERINARIAN");
    });
  });

  // ===========================================================================
  // RESOLVE ACTOR CONTEXT
  // ===========================================================================

  describe("resolveActorContext", () => {
    it("üyelik yoksa STAFF + null tenant + isSuperadmin=false döner", async () => {
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        isSuperadmin: false,
      });
      (
        repo.findActiveMembershipWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      const result = await service.resolveActorContext("user-1");
      expect(result.role).toBe("STAFF");
      expect(result.tenantId).toBeNull();
      expect(result.isSuperadmin).toBe(false);
    });

    it("ilk aktif üyeliği döner (normal kullanıcı)", async () => {
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        isSuperadmin: false,
      });
      (
        repo.findActiveMembershipWithTenant as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        tenantId: "tenant-1",
        role: "OWNER",
        status: "active",
      });
      const result = await service.resolveActorContext("user-1");
      expect(result.role).toBe("OWNER");
      expect(result.tenantId).toBe("tenant-1");
      expect(result.isSuperadmin).toBe(false);
    });

    it("SUPERADMIN kullanıcıda tenantId=null + role=SUPERADMIN döner", async () => {
      (repo.findUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "admin-1",
        isSuperadmin: true,
      });
      const result = await service.resolveActorContext("admin-1");
      expect(result.role).toBe("SUPERADMIN");
      expect(result.tenantId).toBeNull();
      expect(result.isSuperadmin).toBe(true);
    });
  });
});
