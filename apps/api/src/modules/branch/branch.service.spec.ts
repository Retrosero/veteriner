/**
 * @file BranchService unit testleri.
 * @module apps/api/modules/branch/branch.service.spec
 *
 * @description Branch oluşturma, güncelleme, arşivleme ve cross-tenant
 * negatif testleri.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { BranchService } from "./branch.service.js";
import type { BranchRepository } from "./branch.repository.js";

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

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: "tnt-a",
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: "tnt-a",
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeRepo(
  overrides: Partial<{
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
    existsByCode: ReturnType<typeof vi.fn>;
  }> = {},
): BranchRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    existsByCode: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as BranchRepository;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

describe("BranchService", () => {
  let service: BranchService;
  let repo: ReturnType<typeof makeRepo>;
  let audit: AuditService;

  beforeEach(() => {
    repo = makeRepo();
    audit = makeAudit();
    service = new BranchService(repo, audit);
  });

  describe("create", () => {
    it("SUPERADMIN branch oluşturabilir", async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      const result = await service.create(
        "tnt-a",
        { code: "kadikoy", name: "Kadıköy" },
        SUPERADMIN,
      );
      expect(result.id).toBe("br-1");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:branch.create" }),
      );
    });

    it("OWNER kendi tenant'ında branch oluşturabilir", async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      const result = await service.create(
        "tnt-a",
        { code: "kadikoy", name: "Kadıköy" },
        OWNER_A,
      );
      expect(result.id).toBe("br-1");
    });

    it("STAFF branch oluşturamaz (yetki yok) → VET-AUTHZ-0001", async () => {
      await expect(
        service.create(
          "tnt-a",
          { code: "kadikoy", name: "Kadıköy" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });

    it("code çakışması → VET-BRANCH-0003", async () => {
      (repo.existsByCode as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      await expect(
        service.create(
          "tnt-a",
          { code: "taken", name: "X" },
          SUPERADMIN,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-BRANCH-0003" });
    });
  });

  describe("findById (cross-tenant)", () => {
    it("OWNER kendi branch'ini görebilir", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      const result = await service.findById("br-1", OWNER_A);
      expect(result.id).toBe("br-1");
    });

    it("farklı tenant user'ı branch'i göremez → 404", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      const otherTenantStaff: ActorContext = {
        ...STAFF_A,
        tenantId: "tnt-b",
      };
      await expect(
        service.findById("br-1", otherTenantStaff),
      ).rejects.toMatchObject({ errorCode: "VET-BRANCH-0001" });
    });
  });

  describe("archive", () => {
    it("SUPERADMIN branch arşivleyebilir", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });
      (repo.archive as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "closed",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: new Date(),
      });
      const result = await service.archive("br-1", undefined, SUPERADMIN);
      expect(result.status).toBe("closed");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "archive" }),
      );
    });

    it("zaten kapalı branch → VET-BRANCH-0004", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "br-1",
        tenantId: "tnt-a",
        code: "kadikoy",
        name: "Kadıköy",
        city: "İstanbul",
        addressJson: null,
        phone: null,
        status: "closed",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: new Date(),
      });
      await expect(
        service.archive("br-1", undefined, SUPERADMIN),
      ).rejects.toMatchObject({ errorCode: "VET-BRANCH-0004" });
    });
  });
});
