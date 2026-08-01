/**
 * @file TenantService unit testleri.
 * @module apps/api/modules/tenant/tenant.service.spec
 *
 * @description SUPERADMIN kontrolü, tenant kapsamı, slug çakışması,
 * audit event yayını ve kapatma işlemleri için temel testler.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantService } from "./tenant.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { TenantRepository } from "./tenant.repository.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

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

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: "tnt-b",
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeRepo(
  overrides: Partial<{
    existsBySlug: ReturnType<typeof vi.fn>;
    findBySlug: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  }> = {},
): TenantRepository {
  return {
    existsBySlug: vi.fn().mockResolvedValue(false),
    findBySlug: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    close: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  } as unknown as TenantRepository;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

describe("TenantService", () => {
  let service: TenantService;
  let repo: ReturnType<typeof makeRepo>;
  let audit: AuditService;

  beforeEach(() => {
    repo = makeRepo();
    audit = makeAudit();
    service = new TenantService(repo, audit);
  });

  describe("create", () => {
    it("SUPERADMIN tenant oluşturabilir", async () => {
      (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-new",
        slug: "pilot-vet",
        name: "Pilot Vet",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      const result = await service.create(
        {
          slug: "pilot-vet",
          name: "Pilot Vet",
          country: "TR",
        },
        SUPERADMIN,
      );
      expect(result.id).toBe("tnt-new");
      expect(result.slug).toBe("pilot-vet");
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it("SUPERADMIN değilse VET-AUTHZ-0005 fırlatır", async () => {
      await expect(
        service.create(
          { slug: "pilot-vet", name: "Pilot", country: "TR" },
          STAFF_B,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0005" });
    });

    it("slug çakışması VET-TENANT-0004 fırlatır", async () => {
      (repo.existsBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      await expect(
        service.create(
          { slug: "taken", name: "Test", country: "TR" },
          SUPERADMIN,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-TENANT-0004" });
    });
  });

  describe("findById (cross-tenant)", () => {
    it("tenant user kendi tenant'ını görebilir", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-a",
        slug: "tenant-a",
        name: "A",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      const result = await service.findById("tnt-a", OWNER_A);
      expect(result.id).toBe("tnt-a");
    });

    it("tenant user başka tenant'ı göremez → 404 (bilgi sızdırmaz)", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-a",
        slug: "tenant-a",
        name: "A",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      await expect(service.findById("tnt-a", STAFF_B)).rejects.toMatchObject({
        errorCode: "VET-TENANT-0001",
      });
    });
  });

  describe("close", () => {
    it("SUPERADMIN tenant kapatabilir", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-1",
        slug: "t",
        name: "T",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      (repo.close as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-1",
        slug: "t",
        name: "T",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "closed",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: new Date(),
        archivedReason: "pilot sona erdi",
      });
      const result = await service.close(
        "tnt-1",
        { reason: "pilot sona erdi" },
        SUPERADMIN,
      );
      expect(result.status).toBe("closed");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:tenant.close" }),
      );
    });

    it("zaten kapalı tenant → VET-TENANT-0005", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-1",
        status: "closed",
        slug: "t",
        name: "T",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        taxId: null,
        taxIdType: null,
        contactEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: new Date(),
        archivedReason: null,
      });
      await expect(
        service.close("tnt-1", { reason: "x" }, SUPERADMIN),
      ).rejects.toMatchObject({ errorCode: "VET-TENANT-0005" });
    });
  });

  describe("PII mask'leme", () => {
    it("SUPERADMIN tüm PII'yi görür", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-1",
        slug: "t",
        name: "T",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: "1234567890",
        taxIdType: "company",
        contactEmail: "info@t.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      const result = await service.findById("tnt-1", SUPERADMIN);
      expect(result.taxId).toBe("1234567890");
      expect(result.contactEmail).toBe("info@t.com");
    });

    it("STAFF PII'yi mask'li görür", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "tnt-b",
        slug: "t",
        name: "T",
        country: "TR",
        defaultLocale: "tr-TR",
        timezone: "Europe/Istanbul",
        status: "active",
        taxId: "1234567890",
        taxIdType: "company",
        contactEmail: "info@t.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        archivedReason: null,
      });
      const actor: ActorContext = {
        ...STAFF_B,
        tenantId: "tnt-b",
      };
      const result = await service.findById("tnt-b", actor);
      expect(result.taxId).toBe("123***90");
      expect(result.contactEmail).toBe("i***@t.com");
    });
  });
});

void DomainError;
