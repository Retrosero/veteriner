/**
 * @file ProductsService unit testleri.
 * @module apps/api/modules/products/products.service.spec
 *
 * @description GOAL-060 ürün/hizmet kataloğu service testleri.
 *   - Ürün oluşturma (5 kind: stock_product, medicine, vaccine, service,
 *     consumable) + auto-SKU + audit.
 *   - SKU / barkod unique kontrolü (tenant-scoped; cross-tenant
 *     çakışma yok; arşivli SKU tekrar kullanılabilir).
 *   - Listeleme (kind/kinds/clinic/petshop/search/active filtreleri;
 *     arşivlenmiş kayıtlar dönmez).
 *   - Güncelleme (kısmi; arşivli kayıt güncellenemez; SKU/barkod
 *     değişimi unique kontrolü).
 *   - Arşivleme (zaten arşivli → 409 VET-PRODUCT-0003).
 *   - Tenant izolasyonu (cross-tenant → 403 VET-AUTHZ-0001).
 *   - Cross-tenant IDOR → findById null.
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductsRepository } from "./products.repository.js";
import { ProductsService } from "./products.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  ProductCreateInput,
  ProductUpdateInput,
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

/** Default ürün oluşturma input'u (tüm zorunlu alanlar). */
function makeCreateInput(
  overrides: Partial<ProductCreateInput> = {},
): ProductCreateInput {
  return {
    kind: "stock_product",
    name: "Test Ürün",
    unit: "unit",
    taxProfile: "standard",
    currency: "TRY",
    clinicUsage: true,
    petshopUsage: false,
    saleAvailable: true,
    purchaseTracked: true,
    requiresPrescription: false,
    controlledDrug: false,
    ...overrides,
  };
}

function makeUpdateInput(
  overrides: Partial<ProductUpdateInput> = {},
): ProductUpdateInput {
  return overrides;
}

describe("ProductsService", () => {
  let service: ProductsService;
  let repo: ProductsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new ProductsRepository();
    audit = makeAudit();
    service = new ProductsService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // create — başarı
  // ---------------------------------------------------------------------------

  describe("create — başarı", () => {
    it("stock_product oluşturur, auto-SKU üretilir, audit yayınlanır", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "stock_product",
          name: "Royal Canin Yetişkin Kedi Maması 2kg",
          unit: "kg",
          taxProfile: "standard",
          purchasePrice: "120.50",
          salePrice: "180.00",
          clinicUsage: false,
          petshopUsage: true,
        }),
        STAFF_A,
      );

      expect(p.id).toMatch(/^prd-/);
      expect(p.tenantId).toBe(TENANT_A);
      expect(p.kind).toBe("stock_product");
      expect(p.sku).toMatch(/^prd-s000001$/);
      expect(p.name).toBe("Royal Canin Yetişkin Kedi Maması 2kg");
      expect(p.unit).toBe("kg");
      expect(p.taxProfile).toBe("standard");
      expect(p.purchasePrice).toBe("120.50");
      expect(p.salePrice).toBe("180.00");
      expect(p.currency).toBe("TRY");
      expect(p.active).toBe(true);
      expect(p.archivedAt).toBeNull();
      expect(p.petshopUsage).toBe(true);
      expect(p.clinicUsage).toBe(false);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:product.create",
        "product",
        p.id,
        "create",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.any(Object),
      );
    });

    it("medicine oluşturur, requiresPrescription=true set edilir", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "medicine",
          name: "Amoksisilin 250mg Tablet",
          unit: "tablet",
          taxProfile: "reduced",
          requiresPrescription: true,
        }),
        STAFF_A,
      );
      expect(p.kind).toBe("medicine");
      expect(p.requiresPrescription).toBe(true);
      expect(p.controlledDrug).toBe(false);
      expect(p.sku).toMatch(/^prd-m000001$/);
    });

    it("service türünde SKU 'r' prefix alır", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "service",
          name: "Muayene",
          unit: "unit",
          taxProfile: "standard",
          salePrice: "500.00",
        }),
        STAFF_A,
      );
      expect(p.kind).toBe("service");
      expect(p.sku).toMatch(/^prd-r000001$/);
    });

    it("vaccine türünde vaccineProtocolId referansı tutulur", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "vaccine",
          name: "Karma Aşı",
          unit: "dose",
          taxProfile: "standard",
          vaccineProtocolId: "vacp-aaaa-000001",
        }),
        STAFF_A,
      );
      expect(p.kind).toBe("vaccine");
      expect(p.vaccineProtocolId).toBe("vacp-aaaa-000001");
      expect(p.sku).toMatch(/^prd-v000001$/);
    });

    it("kullanıcı SKU verdiyse otomatik üretilmez", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "consumable",
          sku: "EL-001",
          name: "Muayene Eldiveni (M)",
          unit: "pack",
        }),
        STAFF_A,
      );
      expect(p.sku).toBe("EL-001");
    });

    it("fiyat normalize edilir (baştaki sıfırlar kırpılır)", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({
          purchasePrice: "012.30",
        }),
        STAFF_A,
      );
      expect(p.purchasePrice).toBe("12.30");
    });
  });

  // ---------------------------------------------------------------------------
  // create — duplicate
  // ---------------------------------------------------------------------------

  describe("create — duplicate", () => {
    it("aynı tenant + aynı SKU → 409 VET-PRODUCT-0002", async () => {
      await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "TEST-001", name: "A" }),
        STAFF_A,
      );
      await expect(
        service.createProduct(
          TENANT_A,
          makeCreateInput({ sku: "TEST-001", name: "B" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PRODUCT-0002",
        httpStatus: 409,
      });
    });

    it("farklı tenant + aynı SKU → çakışma yok (tenant-scoped)", async () => {
      await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "TEST-001", name: "A" }),
        STAFF_A,
      );
      const pB = await service.createProduct(
        TENANT_B,
        makeCreateInput({ sku: "TEST-001", name: "A" }),
        STAFF_B,
      );
      expect(pB.tenantId).toBe(TENANT_B);
      expect(pB.sku).toBe("TEST-001");
    });

    it("aynı tenant + aynı barkod → 409 VET-PRODUCT-0002", async () => {
      await service.createProduct(
        TENANT_A,
        makeCreateInput({ barcode: "8690000000001", name: "A" }),
        STAFF_A,
      );
      await expect(
        service.createProduct(
          TENANT_A,
          makeCreateInput({ barcode: "8690000000001", name: "B" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PRODUCT-0002",
        httpStatus: 409,
      });
    });

    it("arşivlenmiş kaydın SKU'su tekrar kullanılabilir", async () => {
      const first = await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "TEST-001", name: "A" }),
        STAFF_A,
      );
      await service.archiveProduct(
        TENANT_A,
        first.id,
        { reason: "test" },
        STAFF_A,
      );
      const second = await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "TEST-001", name: "B" }),
        STAFF_A,
      );
      expect(second.sku).toBe("TEST-001");
    });
  });

  // ---------------------------------------------------------------------------
  // create — validation
  // ---------------------------------------------------------------------------

  describe("create — validation", () => {
    it("invalid purchasePrice format → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.createProduct(
          TENANT_A,
          makeCreateInput({ name: "X", purchasePrice: "abc" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // tenant scope
  // ---------------------------------------------------------------------------

  describe("tenant scope", () => {
    it("cross-tenant createProduct → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createProduct(
          TENANT_A,
          makeCreateInput({ name: "X" }),
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("SUPERADMIN tüm tenantlarda createProduct yapabilir", async () => {
      const p = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "X" }),
        SUPERADMIN,
      );
      expect(p.tenantId).toBe(TENANT_A);
    });
  });

  // ---------------------------------------------------------------------------
  // findById — tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("findById — tenant izolasyonu", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "X" }),
        STAFF_A,
      );
      const found = await service.getProduct(TENANT_A, created.id, STAFF_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null (controller 404)", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "X" }),
        STAFF_A,
      );
      const found = await service.getProduct(TENANT_B, created.id, STAFF_B);
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe("list", () => {
    beforeEach(async () => {
      await service.createProduct(
        TENANT_A,
        makeCreateInput({
          name: "Pet Şampuanı",
          petshopUsage: true,
          clinicUsage: false,
        }),
        STAFF_A,
      );
      await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "medicine",
          name: "Antibiyotik",
          unit: "tablet",
          taxProfile: "reduced",
          petshopUsage: false,
          clinicUsage: true,
        }),
        STAFF_A,
      );
      await service.createProduct(
        TENANT_A,
        makeCreateInput({
          kind: "service",
          name: "Muayene",
          petshopUsage: false,
          clinicUsage: true,
        }),
        STAFF_A,
      );
    });

    it("kind filtresi", async () => {
      const res = await service.listProducts(
        TENANT_A,
        {
          kind: "medicine",
          limit: 20,
          offset: 0,
        },
        STAFF_A,
      );
      expect(res.total).toBe(1);
      expect(res.items[0]?.kind).toBe("medicine");
    });

    it("kinds filtresi (OR)", async () => {
      const res = await service.listProducts(
        TENANT_A,
        {
          kinds: ["medicine", "service"],
          limit: 20,
          offset: 0,
        },
        STAFF_A,
      );
      expect(res.total).toBe(2);
    });

    it("petshopUsage filtresi", async () => {
      const res = await service.listProducts(
        TENANT_A,
        {
          petshopUsage: true,
          limit: 20,
          offset: 0,
        },
        STAFF_A,
      );
      expect(res.total).toBe(1);
      expect(res.items[0]?.name).toBe("Pet Şampuanı");
    });

    it("search filtresi (sku/name)", async () => {
      const res = await service.listProducts(
        TENANT_A,
        {
          search: "antibiyotik",
          limit: 20,
          offset: 0,
        },
        STAFF_A,
      );
      expect(res.total).toBe(1);
    });

    it("arşivlenmiş kayıt listelenmez", async () => {
      const all = await service.listProducts(
        TENANT_A,
        { limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(all.total).toBe(3);
      const target = all.items[0];
      if (target) {
        await service.archiveProduct(
          TENANT_A,
          target.id,
          { reason: "test" },
          STAFF_A,
        );
      }
      const after = await service.listProducts(
        TENANT_A,
        { limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(after.total).toBe(2);
    });

    it("tenant izolasyonu: farklı tenant görmez", async () => {
      const res = await service.listProducts(
        TENANT_B,
        { limit: 20, offset: 0 },
        STAFF_B,
      );
      expect(res.total).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe("update", () => {
    it("kısmi güncelleme (yalnızca name) çalışır, audit info", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "A" }),
        STAFF_A,
      );
      const updated = await service.updateProduct(
        TENANT_A,
        created.id,
        makeUpdateInput({ name: "B" }),
        STAFF_A,
      );
      expect(updated.name).toBe("B");
      expect(audit.recordSimple).toHaveBeenLastCalledWith(
        "audit:product.update",
        "product",
        created.id,
        "update",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.any(Object),
      );
    });

    it("SKU değişimi unique kontrolü → 409 VET-PRODUCT-0002", async () => {
      const a = await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "A-001", name: "A" }),
        STAFF_A,
      );
      await service.createProduct(
        TENANT_A,
        makeCreateInput({ sku: "B-001", name: "B" }),
        STAFF_A,
      );
      await expect(
        service.updateProduct(
          TENANT_A,
          a.id,
          makeUpdateInput({ sku: "B-001" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PRODUCT-0002",
        httpStatus: 409,
      });
    });

    it("arşivlenmiş kayıt güncellenemez → 409 VET-PRODUCT-0004", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "A" }),
        STAFF_A,
      );
      await service.archiveProduct(
        TENANT_A,
        created.id,
        { reason: "test" },
        STAFF_A,
      );
      await expect(
        service.updateProduct(
          TENANT_A,
          created.id,
          makeUpdateInput({ name: "B" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PRODUCT-0004",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // archive
  // ---------------------------------------------------------------------------

  describe("archive", () => {
    it("soft delete: archivedAt set edilir, active=false, audit warning", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "A" }),
        STAFF_A,
      );
      const archived = await service.archiveProduct(
        TENANT_A,
        created.id,
        { reason: "stok bitti" },
        STAFF_A,
      );
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.active).toBe(false);
      expect(archived.archiveReason).toBe("stok bitti");
      expect(audit.recordSimple).toHaveBeenLastCalledWith(
        "audit:product.archive",
        "product",
        created.id,
        "archive",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "warning",
        expect.any(Object),
      );
    });

    it("zaten arşivlenmiş → 409 VET-PRODUCT-0003", async () => {
      const created = await service.createProduct(
        TENANT_A,
        makeCreateInput({ name: "A" }),
        STAFF_A,
      );
      await service.archiveProduct(
        TENANT_A,
        created.id,
        { reason: "test" },
        STAFF_A,
      );
      await expect(
        service.archiveProduct(
          TENANT_A,
          created.id,
          { reason: "test2" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PRODUCT-0003",
        httpStatus: 409,
      });
    });
  });
});
