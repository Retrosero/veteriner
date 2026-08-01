/**
 * @file RbacService unit testleri.
 * @module apps/api/common/rbac/rbac.service.spec
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetPermissionCatalogCache,
  loadPermissionCatalog,
} from "./permission-catalog.loader.js";
import { RbacService } from "./rbac.service.js";
import { type AuditService } from "../audit/audit.service.js";

import type { PermissionEvaluationContext } from "./permission.types.js";
import type { RbacRepository } from "./rbac.repository.js";

/**
 *
 * @param overrides
 */
function makeActor(
  overrides: Partial<PermissionEvaluationContext["actor"]> = {},
): PermissionEvaluationContext["actor"] {
  return {
    actorId: "user-1",
    actorType: "user",
    role: "OWNER",
    tenantId: "tenant-1",
    branchId: "branch-1",
    isSuperadmin: false,
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeCtx(
  overrides: Partial<PermissionEvaluationContext> = {},
): PermissionEvaluationContext {
  return {
    actor: makeActor(),
    permission: "branch:branch:read",
    ...overrides,
  };
}

/**
 *
 */
function makeAuditStub(): AuditService {
  return {
    recordSimple: vi.fn().mockResolvedValue({
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
    }),
    record: vi.fn().mockResolvedValue({
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
    }),
  } as unknown as AuditService;
}

describe("RbacService", () => {
  let audit: AuditService;
  let service: RbacService;

  beforeEach(() => {
    resetPermissionCatalogCache();
    const cat = loadPermissionCatalog();
    expect(cat.length).toBeGreaterThan(0);

    audit = makeAuditStub();
    const repoStub = {} as RbacRepository;
    service = new RbacService(audit, repoStub);
  });

  describe("SUPERADMIN bypass", () => {
    it("SUPERADMIN her permission'a sahiptir", () => {
      const decision = service.evaluate(
        makeCtx({
          actor: makeActor({
            isSuperadmin: true,
            role: "SUPERADMIN",
            tenantId: null,
            branchId: null,
          }),
          permission: "branch:branch:create",
        }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe("superadmin_bypass");
    });
  });

  describe("rol eşleşmesi", () => {
    it("OWNER branch:branch:read alabilir", () => {
      const decision = service.evaluate(
        makeCtx({
          actor: makeActor({ role: "OWNER" }),
          permission: "branch:branch:read",
        }),
      );
      expect(decision.allowed).toBe(true);
    });

    it("STAFF branch:branch:create alamaz", () => {
      const decision = service.evaluate(
        makeCtx({
          actor: makeActor({ role: "STAFF" }),
          permission: "branch:branch:create",
        }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("no_role_match");
    });

    it("VETERINARIAN user:user:read alabilir", () => {
      const decision = service.evaluate(
        makeCtx({
          actor: makeActor({ role: "VETERINARIAN" }),
          permission: "user:user:read",
        }),
      );
      expect(decision.allowed).toBe(true);
    });

    it("PET_OWNER_PORTAL user:user:read alamaz", () => {
      const decision = service.evaluate(
        makeCtx({
          actor: makeActor({ role: "PET_OWNER_PORTAL" }),
          permission: "user:user:read",
        }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  describe("bilinmeyen permission", () => {
    it("katalog dışı permission reddedilir", () => {
      const decision = service.evaluate(
        makeCtx({ permission: "unknown:module:action" }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("no_role_match");
    });
  });

  describe("evaluateAll (AND semantiği)", () => {
    it("tüm permission'lar geçerse allowed=true", () => {
      const decision = service.evaluateAll(
        {
          actor: makeActor({ role: "OWNER" }),
        },
        ["branch:branch:read", "branch:branch:update"],
      );
      expect(decision.allowed).toBe(true);
    });

    it("bir permission reddedilirse kısa devre ile red", () => {
      const decision = service.evaluateAll(
        {
          actor: makeActor({ role: "STAFF" }),
        },
        ["branch:branch:read", "branch:branch:create"],
      );
      expect(decision.allowed).toBe(false);
    });
  });

  describe("listPermissionsForRole", () => {
    it("OWNER için en az bir permission listelenir", () => {
      const perms = service.listPermissionsForRole("OWNER");
      expect(perms.length).toBeGreaterThan(0);
    });
  });

  describe("audit log entegrasyonu", () => {
    it("reddedilen her istek audit:rbac.permission_denied event'i yazar", () => {
      service.evaluate(
        makeCtx({
          actor: makeActor({ role: "STAFF" }),
          permission: "branch:branch:create",
        }),
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:rbac.permission_denied",
        "permission",
        "branch:branch:create",
        "read",
        expect.objectContaining({ actorId: "user-1" }),
        "warning",
        expect.objectContaining({ permission: "branch:branch:create" }),
      );
    });
  });
});
