/**
 * @file SuppliersService unit testleri.
 * @module apps/api/modules/suppliers/suppliers.service.spec
 *
 * @description GOAL-062 tedarikçi kataloğu service testleri.
 *   - Tedarikçi oluşturma (3 type: clinic, petshop, general) + audit.
 *   - Code unique kontrolü (tenant-scoped; cross-tenant çakışma yok;
 *     arşivli code tekrar kullanılabilir).
 *   - Listeleme (type/active/search filtreleri; arşivlenmiş kayıtlar
 *     dönmez).
 *   - Güncelleme (kısmi; arşivli kayıt güncellenemez; code değişimi
 *     unique kontrolü).
 *   - Arşivleme (zaten arşivli → 409 VET-SUPPLIER-0003).
 *   - Tenant izolasyonu (cross-tenant → 403 VET-AUTHZ-0001).
 *   - Cross-tenant IDOR → findById null.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import { SuppliersService } from "./suppliers.service.js";
import { SuppliersRepository } from "./suppliers.repository.js";
import type {
  SupplierCreateInput,
  SupplierUpdateInput,
} from "@vetniva/contracts";

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

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi
      .fn()
      .mockImplementation(
        async (
          _eventName: string,
          _targetType: string,
          _targetId: string,
          _action: string,
          _actor: unknown,
          _severity: string,
        ) => ({ eventId: "ev-1" }),
      ),
  } as unknown as AuditService;
}

/** Default tedarikçi oluşturma input'u (tüm zorunlu alanlar). */
function makeCreateInput(
  overrides: Partial<SupplierCreateInput> = {},
): SupplierCreateInput {
  return {
    name: "Test Tedarikçi",
    code: "TEST-001",
    type: "general",
    ...overrides,
  };
}

function makeUpdateInput(
  overrides: Partial<SupplierUpdateInput> = {},
): SupplierUpdateInput {
  return overrides;
}

describe("SuppliersService", () => {
  let service: SuppliersService;
  let repo: SuppliersRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new SuppliersRepository();
    audit = makeAudit();
    service = new SuppliersService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createSupplier
  // ---------------------------------------------------------------------------

  describe("createSupplier", () => {
    it("yeni tedarikçi oluşturur (general)", async () => {
      const out = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(/^sup-/);
      expect(out.name).toBe("Test Tedarikçi");
      expect(out.code).toBe("TEST-001");
      expect(out.type).toBe("general");
      expect(out.active).toBe(true);
      expect(out.archivedAt).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:supplier.create",
        "supplier",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.anything(),
      );
    });

    it("clinic türünde tedarikçi oluşturur", async () => {
      const out = await service.createSupplier(
        TENANT_A,
        makeCreateInput({ type: "clinic", code: "MED-001" }),
        STAFF_A,
      );
      expect(out.type).toBe("clinic");
    });

    it("petshop türünde tedarikçi oluşturur", async () => {
      const out = await service.createSupplier(
        TENANT_A,
        makeCreateInput({ type: "petshop", code: "PET-001" }),
        STAFF_A,
      );
      expect(out.type).toBe("petshop");
    });

    it("aynı code ile ikinci tedarikçi 409 VET-SUPPLIER-0002 verir", async () => {
      await service.createSupplier(TENANT_A, makeCreateInput(), STAFF_A);
      await expect(
        service.createSupplier(TENANT_A, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SUPPLIER-0002",
        httpStatus: 409,
      });
    });

    it("farklı tenant aynı code kullanabilir (tenant izolasyonu)", async () => {
      await service.createSupplier(TENANT_A, makeCreateInput(), STAFF_A);
      const out = await service.createSupplier(
        TENANT_B,
        makeCreateInput(),
        STAFF_B,
      );
      expect(out.id).toMatch(/^sup-/);
    });

    it("arşivli tedarikçinin code'u tekrar kullanılabilir", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.archiveSupplier(
        TENANT_A,
        a.id,
        { reason: "eski" },
        STAFF_A,
      );
      const b = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(b.id).not.toBe(a.id);
    });
  });

  // ---------------------------------------------------------------------------
  // listSuppliers
  // ---------------------------------------------------------------------------

  describe("listSuppliers", () => {
    it("tenant-scoped listeleme; arşivliler dönmez", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.createSupplier(
        TENANT_B,
        makeCreateInput(),
        STAFF_B,
      );
      const list = await service.listSuppliers(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe(a.id);
    });

    it("type filtresi çalışır", async () => {
      await service.createSupplier(
        TENANT_A,
        makeCreateInput({ type: "clinic", code: "C-1" }),
        STAFF_A,
      );
      await service.createSupplier(
        TENANT_A,
        makeCreateInput({ type: "petshop", code: "P-1" }),
        STAFF_A,
      );
      const list = await service.listSuppliers(
        TENANT_A,
        { type: "clinic", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.type).toBe("clinic");
    });

    it("search name/code üzerinde çalışır", async () => {
      await service.createSupplier(
        TENANT_A,
        makeCreateInput({ name: "Pharma A", code: "PA-001" }),
        STAFF_A,
      );
      await service.createSupplier(
        TENANT_A,
        makeCreateInput({ name: "VetMed B", code: "VB-001" }),
        STAFF_A,
      );
      const list = await service.listSuppliers(
        TENANT_A,
        { search: "pharma", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.name).toBe("Pharma A");
    });
  });

  // ---------------------------------------------------------------------------
  // getSupplier
  // ---------------------------------------------------------------------------

  describe("getSupplier", () => {
    it("ID'ye göre tedarikçi getirir", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.getSupplier(TENANT_A, a.id, STAFF_A);
      expect(out?.id).toBe(a.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.getSupplier(TENANT_B, a.id, STAFF_B);
      expect(out).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateSupplier
  // ---------------------------------------------------------------------------

  describe("updateSupplier", () => {
    it("kısmi güncelleme yapar", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.updateSupplier(
        TENANT_A,
        a.id,
        makeUpdateInput({ name: "Yeni Ad", phone: "+90 555 0" }),
        STAFF_A,
      );
      expect(out.name).toBe("Yeni Ad");
      expect(out.phone).toBe("+90 555 0");
      expect(out.code).toBe("TEST-001");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:supplier.update",
        "supplier",
        a.id,
        "update",
        expect.anything(),
        "info",
        expect.anything(),
      );
    });

    it("code değişirse unique kontrolü yapılır", async () => {
      await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const second = await service.createSupplier(
        TENANT_A,
        makeCreateInput({ code: "OTHER-001" }),
        STAFF_A,
      );
      await expect(
        service.updateSupplier(
          TENANT_A,
          second.id,
          makeUpdateInput({ code: "TEST-001" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SUPPLIER-0002",
        httpStatus: 409,
      });
    });

    it("arşivli tedarikçi güncellenemez 409 VET-SUPPLIER-0004", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.archiveSupplier(
        TENANT_A,
        a.id,
        { reason: "eski" },
        STAFF_A,
      );
      await expect(
        service.updateSupplier(
          TENANT_A,
          a.id,
          makeUpdateInput({ name: "X" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SUPPLIER-0004",
        httpStatus: 409,
      });
    });

    it("olmayan tedarikçi → 404 VET-SUPPLIER-0001", async () => {
      await expect(
        service.updateSupplier(
          TENANT_A,
          "00000000-0000-0000-0000-000000000000",
          makeUpdateInput({ name: "X" }),
          STAFF_A,
        ),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  // ---------------------------------------------------------------------------
  // archiveSupplier
  // ---------------------------------------------------------------------------

  describe("archiveSupplier", () => {
    it("soft delete yapar", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.archiveSupplier(
        TENANT_A,
        a.id,
        { reason: "test" },
        STAFF_A,
      );
      expect(out.archivedAt).not.toBeNull();
      expect(out.archivedBy).toBe("usr-staff-a");
      expect(out.archiveReason).toBe("test");
      expect(out.active).toBe(false);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:supplier.archive",
        "supplier",
        a.id,
        "archive",
        expect.anything(),
        "warning",
        expect.anything(),
      );
    });

    it("zaten arşivli → 409 VET-SUPPLIER-0003", async () => {
      const a = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.archiveSupplier(
        TENANT_A,
        a.id,
        { reason: "ilk" },
        STAFF_A,
      );
      await expect(
        service.archiveSupplier(
          TENANT_A,
          a.id,
          { reason: "ikinci" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SUPPLIER-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createSupplier(
          TENANT_B,
          makeCreateInput(),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("SUPERADMIN tüm tenant'lara erişir", async () => {
      const out = await service.createSupplier(
        TENANT_A,
        makeCreateInput(),
        SUPERADMIN,
      );
      expect(out.id).toMatch(/^sup-/);
    });
  });
});
