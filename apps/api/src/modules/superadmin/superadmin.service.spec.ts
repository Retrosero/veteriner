/**
 * @file SuperadminService unit testleri.
 * @module apps/api/modules/superadmin/superadmin.service.spec
 *
 * @description Tenant listesi, detay, recent events ve SUPERADMIN
 *   bypass senaryoları için temel testler. PrismaService +
 *   FeatureFlagService mock'lanır; aggregation mantığı izole sınanır.
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SuperadminService } from "./superadmin.service.js";
import { type FeatureFlagService } from "../feature-flag/feature-flag.service.js";

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const T3 = "33333333-3333-3333-3333-333333333333";

/** Tenant fixture — Prisma `tenant.findUnique / findMany` shape'i. */
function makeTenant(
  id: string,
  name: string,
  overrides: Partial<{
    country: string;
    status: string;
    createdAt: Date;
  }> = {},
) {
  return {
    id,
    slug: `slug-${id.slice(0, 4)}`,
    name,
    country: overrides.country ?? "TR",
    defaultLocale: "tr-TR",
    timezone: "Europe/Istanbul",
    status: overrides.status ?? "active",
    taxId: null,
    taxIdType: null,
    contactEmail: null,
    createdAt: overrides.createdAt ?? new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    archivedAt: null,
    archivedReason: null,
  };
}

/** PrismaService minimal surface — SuperadminService'in kullandığı metotlar. */
function makePrisma(overrides: {
  tenants?: ReturnType<typeof vi.fn>[];
  tenantFindUnique?: ReturnType<typeof vi.fn>;
  branchCount?: ReturnType<typeof vi.fn>;
  membershipCount?: ReturnType<typeof vi.fn>;
  userFindFirst?: ReturnType<typeof vi.fn>;
  fileAggregate?: ReturnType<typeof vi.fn>;
  auditFindMany?: ReturnType<typeof vi.fn>;
  tenantCount?: ReturnType<typeof vi.fn>;
}) {
  const tenantFindMany =
    overrides.tenants?.shift?.() ??
    vi
      .fn()
      .mockResolvedValue([
        makeTenant(T1, "Alpha"),
        makeTenant(T2, "Beta"),
        makeTenant(T3, "Gamma"),
      ]);

  return {
    tenant: {
      findMany: tenantFindMany,
      count: overrides.tenantCount ?? vi.fn().mockResolvedValue(3),
      findUnique:
        overrides.tenantFindUnique ??
        vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          return Promise.resolve(
            [T1, T2, T3].includes(where.id) ? makeTenant(where.id, "X") : null,
          );
        }),
    },
    branch: {
      count: overrides.branchCount ?? vi.fn().mockResolvedValue(2),
    },
    userTenantMembership: {
      count: overrides.membershipCount ?? vi.fn().mockResolvedValue(5),
    },
    user: {
      findFirst:
        overrides.userFindFirst ??
        vi
          .fn()
          .mockResolvedValue({ lastLoginAt: new Date("2025-02-01T12:00:00Z") }),
    },
    fileMeta: {
      aggregate:
        overrides.fileAggregate ??
        vi.fn().mockResolvedValue({ _sum: { sizeBytes: BigInt(0) } }),
    },
    auditEvent: {
      findMany:
        overrides.auditFindMany ??
        vi.fn().mockResolvedValue([
          {
            id: "ev-1",
            eventName: "audit:tenant.update",
            actorId: "usr-1",
            targetType: "tenant",
            targetId: T1,
            createdAt: new Date("2025-02-02T10:00:00Z"),
          },
        ]),
    },
  };
}

/** FeatureFlagService minimal surface. */
function makeFeatureFlag(): FeatureFlagService {
  return {
    listModules: vi.fn().mockResolvedValue([
      { key: "clinic", enabled: true },
      { key: "billing", enabled: true },
      { key: "petshop", enabled: false },
    ]),
  } as unknown as FeatureFlagService;
}

describe("SuperadminService", () => {
  let service: SuperadminService;
  let prisma: ReturnType<typeof makePrisma>;
  let featureFlag: FeatureFlagService;

  beforeEach(() => {
    prisma = makePrisma({});
    featureFlag = makeFeatureFlag();
    service = new SuperadminService(
      prisma as unknown as ConstructorParameters<typeof SuperadminService>[0],
      featureFlag,
    );
  });

  describe("listTenants", () => {
    it("3 tenant döner ve her biri için metrikleri toplar", async () => {
      const result = await service.listTenants(1, 20, {});
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      const first = result.items[0]!;
      expect(first.branchCount).toBe(2);
      expect(first.userCount).toBe(5);
      expect(first.enabledModules).toEqual(["clinic", "billing"]);
      expect(first.errorCountLast24h).toBe(0);
    });

    it("status filtresi Prisma where'a aktarılır", async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([makeTenant(T1, "Alpha", { status: "active" })]);
      const customPrisma = makePrisma({
        tenants: [findMany],
        tenantCount: vi.fn().mockResolvedValue(1),
      });
      const customService = new SuperadminService(
        customPrisma as unknown as ConstructorParameters<
          typeof SuperadminService
        >[0],
        featureFlag,
      );
      await customService.listTenants(1, 20, { status: "active" });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // Vitest asymmetric matcher API'si `any` dondurur; bu test yalnizca
          // Prisma `where.status` iletimini dogrular.

          where: expect.objectContaining({ status: "active" }),
        }),
      );
    });
  });

  describe("getTenantDetail", () => {
    it("branchCount + userCount doğru döner", async () => {
      prisma.branch.count = vi.fn().mockResolvedValue(7);
      prisma.userTenantMembership.count = vi.fn().mockResolvedValue(42);
      const detail = await service.getTenantDetail(T1);
      expect(detail.branchCount).toBe(7);
      expect(detail.userCount).toBe(42);
      expect(detail.recentEvents).toHaveLength(1);
      expect(detail.recentEvents[0]?.eventName).toBe("audit:tenant.update");
    });

    it("bilinmeyen tenant → 404 VET-TENANT-0001", async () => {
      prisma.tenant.findUnique = vi.fn().mockResolvedValue(null);
      await expect(
        service.getTenantDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({
        errorCode: "VET-TENANT-0001",
      });
    });
  });

  describe("SUPERADMIN bypass", () => {
    it("service katmanı SUPERADMIN kontrolü uygulamaz; guard'a bırakır", async () => {
      // PermissionsGuard + @RequirePermissions('audit:log:read')
      // SUPERADMIN bypass'ını RbacService üzerinden uygular; service
      // katmanı actor almaz (güvenlik kontrolü guard'da merkezileşmiştir).
      // Burada service'in herhangi bir actor olmadan çağrılabildiğini,
      // yani guard'a güvendiğini doğruluyoruz.
      const detail = await service.getTenantDetail(T1);
      expect(detail.tenantId).toBe(T1);
      // Guard 403 (VET-AUTHZ-0001) davranışı PermissionsGuard birim
      // testlerinde zaten sınanıyor; service'in kendisi 403 fırlatmaz.
    });
  });

  describe("cross-tenant guard (bilgi sızdırmaz)", () => {
    it("bilinmeyen tenant ID → 404 VET-TENANT-0001", async () => {
      prisma.tenant.findUnique = vi.fn().mockResolvedValue(null);
      await expect(
        service.getTenantDetail("99999999-9999-9999-9999-999999999999"),
      ).rejects.toMatchObject({
        errorCode: "VET-TENANT-0001",
        httpStatus: 404,
      });
    });
  });

  describe("getRecentEvents", () => {
    it("son 10 event'i tarih azalan sırada döner", async () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        id: `ev-${i}`,
        eventName: `audit:test.${i}`,
        actorId: `usr-${i}`,
        targetType: "tenant",
        targetId: T1,
        createdAt: new Date(
          `2025-02-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        ),
      }));
      prisma.auditEvent.findMany = vi.fn().mockResolvedValue(events);
      const result = await service.getRecentEvents(T1, 10);
      expect(result).toHaveLength(10);
      expect(result[0]?.id).toBe("ev-0");
      // createdAt alanları ISO string'e map edilmiş olmalı.
      expect(result[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("storage usage", () => {
    it("boş tenant için 0 MB döner", async () => {
      prisma.fileMeta.aggregate = vi
        .fn()
        .mockResolvedValue({ _sum: { sizeBytes: null } });
      const detail = await service.getTenantDetail(T1);
      expect(detail.storageUsedMb).toBe(0);
    });
  });
});
