/**
 * @file OwnersService unit testleri.
 * @module apps/api/modules/owners/owners.service.spec
 *
 * @description KVKK consent, telefon normalize (E.164), TCKN/VKN
 * doğrulama, tenant izolasyonu, duplicate kontrolü, arama,
 * pagination, arşivleme ve audit event yayını testleri.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnersRepository } from "./owners.repository.js";
import { OwnersService } from "./owners.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("OwnersService", () => {
  let service: OwnersService;
  let repo: OwnersRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new OwnersRepository();
    audit = makeAudit();
    service = new OwnersService(repo, audit);
  });

  describe("create — başarı", () => {
    it("owner oluşturur, telefon E.164 normalize olur, audit yayınlanır", async () => {
      const owner = await service.create(
        TENANT_A,
        {
          firstName: "Ayşe",
          lastName: "Yılmaz",
          phone: "0532 123 45 67",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );

      expect(owner.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(owner.tenantId).toBe(TENANT_A);
      expect(owner.phone).toBe("+905321234567");
      expect(owner.firstName).toBe("Ayşe");
      expect(owner.archivedAt).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:owner.create",
          targetType: "owner",
          action: "create",
          severity: "info",
        }),
      );
    });

    it("geçerli TCKN ile oluşturma", async () => {
      // 12345678950 — algoritmik olarak geçerli TCKN.
      const owner = await service.create(
        TENANT_A,
        {
          firstName: "Mehmet",
          lastName: "Demir",
          phone: "05551234567",
          taxId: "12345678950",
          consentKvkk: true,
          consentMarketing: true,
        },
        STAFF_A,
      );
      expect(owner.taxId).toBe("12345678950");
    });
  });

  describe("create — validation", () => {
    it("KVKK consent yoksa 422 VET-VALIDATION-0002", async () => {
      await expect(
        service.create(
          TENANT_A,
          {
            firstName: "Ayşe",
            lastName: "Yılmaz",
            phone: "05321234567",
            consentKvkk: false,
            consentMarketing: false,
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0002",
        httpStatus: 422,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("invalid TCKN → 422 VET-VALIDATION-0006", async () => {
      // 11111111111 — 10. hane geçerli ama 11. hane yanlış.
      await expect(
        service.create(
          TENANT_A,
          {
            firstName: "X",
            lastName: "Y",
            phone: "05321234567",
            taxId: "11111111111",
            consentKvkk: true,
            consentMarketing: false,
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0006",
        httpStatus: 422,
      });
    });

    it("invalid VKN → 422 VET-VALIDATION-0006", async () => {
      // 1000000000 — son hane (check digit) yanlış.
      await expect(
        service.create(
          TENANT_A,
          {
            firstName: "X",
            lastName: "Y",
            phone: "05321234567",
            taxId: "1000000000",
            consentKvkk: true,
            consentMarketing: false,
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0006",
        httpStatus: 422,
      });
    });
  });

  describe("create — duplicate", () => {
    it("aynı tenant + aynı telefon → 409 VET-CLINIC-0002", async () => {
      await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      await expect(
        service.create(
          TENANT_A,
          {
            firstName: "C",
            lastName: "D",
            phone: "+905321234567", // farklı format, aynı numara
            consentKvkk: true,
            consentMarketing: false,
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0002",
        httpStatus: 409,
      });
    });

    it("farklı tenant + aynı telefon → çakışma yok (tenant-scoped)", async () => {
      await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      const ownerB = await service.create(
        TENANT_B,
        {
          firstName: "E",
          lastName: "F",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_B,
      );
      expect(ownerB.tenantId).toBe(TENANT_B);
      expect(ownerB.phone).toBe("+905321234567");
    });
  });

  describe("findById — tenant izolasyonu", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null (controller 404)", async () => {
      const created = await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      const found = await service.findById(TENANT_B, created.id, STAFF_B);
      expect(found).toBeNull();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await service.create(
        TENANT_A,
        {
          firstName: "Ayşe",
          lastName: "Yılmaz",
          phone: "05321111111",
          email: "ayse@example.com",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      await service.create(
        TENANT_A,
        {
          firstName: "Mehmet",
          lastName: "Demir",
          phone: "05322222222",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      await service.create(
        TENANT_B,
        {
          firstName: "Ayşe",
          lastName: "Kara",
          phone: "05323333333",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_B,
      );
    });

    it("ad ile arama (case-insensitive)", async () => {
      const r = await service.search(
        TENANT_A,
        { search: "ayşe", limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.firstName).toBe("Ayşe");
    });

    it("telefon ile arama", async () => {
      const r = await service.search(
        TENANT_A,
        { phone: "532111", limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.phone).toBe("+905321111111");
    });

    it("pagination: limit + offset", async () => {
      const page1 = await service.search(
        TENANT_A,
        { limit: 1, offset: 0 },
        STAFF_A,
      );
      const page2 = await service.search(
        TENANT_A,
        { limit: 1, offset: 1 },
        STAFF_A,
      );
      expect(page1.total).toBe(2);
      expect(page2.total).toBe(2);
      expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
    });

    it("tenant izolasyonu: başka tenant kayıtları görünmez", async () => {
      const r = await service.search(
        TENANT_A,
        { search: "Ayşe", limit: 20, offset: 0 },
        STAFF_A,
      );
      // Tenant A'da yalnızca 1 Ayşe var (Tenant B'deki diğeri Hariç).
      expect(r.total).toBe(1);
      expect(r.items[0]?.tenantId).toBe(TENANT_A);
    });
  });

  describe("archive", () => {
    it("archivedAt set edilir, audit:owner.archive (warning) yayınlanır", async () => {
      const created = await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      const archived = await service.archive(TENANT_A, created.id, STAFF_A);
      expect(archived.archivedAt).not.toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:owner.archive",
          targetType: "owner",
          action: "archive",
          severity: "warning",
        }),
      );
    });

    it("ikinci kez arşivleme idempotent", async () => {
      const created = await service.create(
        TENANT_A,
        {
          firstName: "A",
          lastName: "B",
          phone: "05321234567",
          consentKvkk: true,
          consentMarketing: false,
        },
        STAFF_A,
      );
      const first = await service.archive(TENANT_A, created.id, STAFF_A);
      const second = await service.archive(TENANT_A, created.id, STAFF_A);
      expect(second.archivedAt).toBe(first.archivedAt);
    });

    it("olmayan id → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.archive(
          TENANT_A,
          "00000000-0000-0000-0000-000000000000",
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
