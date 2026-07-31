/**
 * @file ClinicSalesService unit testleri.
 * @module apps/api/modules/clinic-sales/clinic-sales.service.spec
 *
 * @description GOAL-071 klinik satış taslağı service testleri.
 *   - Taslak oluşturma (satır toplamı + indirim + audit).
 *   - İndirim yetkisi (STAFF max %10, OWNER sınırsız).
 *   - Ürün arşivliyse 422 VET-CLINIC_SALE-0005.
 *   - Tamamlama (draft → completed + audit).
 *   - İptal (draft/completed → cancelled + audit).
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { ClinicSalesService } from "./clinic-sales.service.js";
import { ClinicSalesRepository } from "./clinic-sales.repository.js";
import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import type {
  ClinicSaleCancelInput,
  ClinicSaleCreateInput,
} from "@vetniva/contracts";
import type { ProductCreateInput } from "@vetniva/contracts";

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

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
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
  correlationId: "req-4",
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

function makeProductInput(
  overrides: Partial<ProductCreateInput> = {},
): ProductCreateInput {
  return {
    kind: "service",
    name: "Test Hizmet",
    unit: "unit",
    taxProfile: "standard",
    currency: "TRY",
    clinicUsage: true,
    petshopUsage: false,
    saleAvailable: true,
    purchaseTracked: false,
    requiresPrescription: false,
    controlledDrug: false,
    salePrice: "100",
    ...overrides,
  };
}

function makeSaleInput(
  productId: string,
  overrides: Partial<ClinicSaleCreateInput> = {},
): ClinicSaleCreateInput {
  return {
    customerOwnerId: "00000000-0000-0000-0000-000000000001",
    customerPatientId: "00000000-0000-0000-0000-000000000002",
    sourceType: "examination",
    sourceId: "exam-001",
    currency: "TRY",
    globalDiscountPercent: 0,
    lines: [
      { productId, unit: "unit", quantity: "2" },
    ],
    ...overrides,
  };
}

describe("ClinicSalesService", () => {
  let service: ClinicSalesService;
  let repo: ClinicSalesRepository;
  let productsService: ProductsService;
  let audit: AuditService;

  beforeEach(() => {
    repo = new ClinicSalesRepository();
    audit = makeAudit();
    productsService = new ProductsService(new ProductsRepository(), audit);
    service = new ClinicSalesService(repo, productsService, audit);
  });

  async function seedProduct(
    sku: string,
    name: string = "Test Hizmet",
    salePrice: string = "100",
  ): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      { ...makeProductInput({ name, salePrice }), sku },
      STAFF_A,
    );
    return p.id;
  }

  // ---------------------------------------------------------------------------
  // createClinicSale
  // ---------------------------------------------------------------------------

  describe("createClinicSale", () => {
    it("taslak oluşturur + totalAmount + audit", async () => {
      const pid = await seedProduct("CS-1");
      const out = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [
            { productId: pid, unit: "unit", quantity: "2" },
            { productId: pid, unit: "unit", quantity: "3", unitPrice: "50" },
          ],
        }),
        OWNER_A,
      );
      expect(out.sale.id).toMatch(/^cs-/);
      expect(out.sale.status).toBe("draft");
      // 2*100 (default salePrice) + 3*50 = 350
      expect(out.sale.totalAmount).toBe("350");
      expect(out.sale.netAmount).toBe("350");
      expect(out.lines.length).toBe(2);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinic_sale.create",
        "clinic_sale",
        out.sale.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ lineCount: 2 }),
      );
    });

    it("OWNER global indirim sınırsız uygular", async () => {
      const pid = await seedProduct("CS-2");
      const out = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [{ productId: pid, unit: "unit", quantity: "1" }],
          globalDiscountPercent: 50,
        }),
        OWNER_A,
      );
      // 100 - %50 = 50
      expect(out.sale.netAmount).toBe("50");
    });

    it("STAFF %10 üstü global indirim 403 VET-CLINIC_SALE-0004", async () => {
      const pid = await seedProduct("CS-3");
      await expect(
        service.createClinicSale(
          TENANT_A,
          makeSaleInput(pid, {
            lines: [{ productId: pid, unit: "unit", quantity: "1" }],
            globalDiscountPercent: 25,
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0004",
        httpStatus: 403,
      });
    });

    it("STAFF %10 sınırında global indirim kabul", async () => {
      const pid = await seedProduct("CS-4");
      const out = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [{ productId: pid, unit: "unit", quantity: "1" }],
          globalDiscountPercent: 10,
        }),
        STAFF_A,
      );
      expect(out.sale.netAmount).toBe("90");
    });

    it("STAFF satır indirimi %10 üstü 403 VET-CLINIC_SALE-0004", async () => {
      const pid = await seedProduct("CS-5");
      await expect(
        service.createClinicSale(
          TENANT_A,
          makeSaleInput(pid, {
            lines: [
              {
                productId: pid,
                unit: "unit",
                quantity: "1",
                discountPercent: 25,
              },
            ],
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0004",
        httpStatus: 403,
      });
    });

    it("VETERINARIAN da max %10 sınırına tabi", async () => {
      const pid = await seedProduct("CS-6");
      await expect(
        service.createClinicSale(
          TENANT_A,
          makeSaleInput(pid, {
            lines: [{ productId: pid, unit: "unit", quantity: "1" }],
            globalDiscountPercent: 20,
          }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0004",
        httpStatus: 403,
      });
    });

    it("ürün arşivliyse 422 VET-CLINIC_SALE-0005", async () => {
      const pid = await seedProduct("CS-7");
      await productsService.archiveProduct(
        TENANT_A,
        pid,
        { reason: "eski" },
        STAFF_A,
      );
      await expect(
        service.createClinicSale(
          TENANT_A,
          makeSaleInput(pid),
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0005",
        httpStatus: 422,
      });
    });

    it("ürün yoksa 422 VET-CLINIC_SALE-0005", async () => {
      await expect(
        service.createClinicSale(
          TENANT_A,
          makeSaleInput("00000000-0000-0000-0000-000000000000"),
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0005",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listClinicSales
  // ---------------------------------------------------------------------------

  describe("listClinicSales", () => {
    it("tenant-scoped; sourceType filtresi çalışır", async () => {
      const pid = await seedProduct("CS-LIST");
      await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, {
          sourceType: "examination",
          sourceId: "e-1",
        }),
        OWNER_A,
      );
      await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, {
          sourceType: "lab_order",
          sourceId: "l-1",
        }),
        OWNER_A,
      );
      const list = await service.listClinicSales(
        TENANT_A,
        { sourceType: "lab_order", limit: 50, offset: 0 },
        OWNER_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.sourceType).toBe("lab_order");
    });
  });

  // ---------------------------------------------------------------------------
  // getClinicSaleDetail
  // ---------------------------------------------------------------------------

  describe("getClinicSaleDetail", () => {
    it("cross-tenant IDOR → null", async () => {
      const pid = await seedProduct("CS-ISO");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid, { sourceId: "e-iso" }),
        OWNER_A,
      );
      const detail = await service.getClinicSaleDetail(
        TENANT_B,
        created.sale.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // completeClinicSale
  // ---------------------------------------------------------------------------

  describe("completeClinicSale", () => {
    it("draft → completed + audit", async () => {
      const pid = await seedProduct("CS-CMP");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      const completed = await service.completeClinicSale(
        TENANT_A,
        created.sale.id,
        OWNER_A,
      );
      expect(completed.sale.status).toBe("completed");
      expect(completed.sale.completedAt).not.toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinic_sale.complete",
        "clinic_sale",
        created.sale.id,
        "update",
        expect.anything(),
        "info",
        expect.anything(),
      );
    });

    it("draft olmayan tamamlanamaz 409 VET-CLINIC_SALE-0002", async () => {
      const pid = await seedProduct("CS-CMP2");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      await service.completeClinicSale(TENANT_A, created.sale.id, OWNER_A);
      await expect(
        service.completeClinicSale(TENANT_A, created.sale.id, OWNER_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelClinicSale
  // ---------------------------------------------------------------------------

  describe("cancelClinicSale", () => {
    it("draft → cancelled + cancelReason set", async () => {
      const pid = await seedProduct("CS-CNL");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      const cancelled = await service.cancelClinicSale(
        TENANT_A,
        created.sale.id,
        { reason: "yanlış hasta" } as ClinicSaleCancelInput,
        OWNER_A,
      );
      expect(cancelled.sale.status).toBe("cancelled");
      expect(cancelled.sale.cancelReason).toBe("yanlış hasta");
    });

    it("zaten iptal edilmiş → 409 VET-CLINIC_SALE-0006", async () => {
      const pid = await seedProduct("CS-CNL2");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      await service.cancelClinicSale(
        TENANT_A,
        created.sale.id,
        { reason: "ilk" } as ClinicSaleCancelInput,
        OWNER_A,
      );
      await expect(
        service.cancelClinicSale(
          TENANT_A,
          created.sale.id,
          { reason: "ikinci" } as ClinicSaleCancelInput,
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0006",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateClinicSale
  // ---------------------------------------------------------------------------

  describe("updateClinicSale", () => {
    it("taslak satışta notes günceller", async () => {
      const pid = await seedProduct("CS-UP");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      const updated = await service.updateClinicSale(
        TENANT_A,
        created.sale.id,
        { notes: "yeni" },
        OWNER_A,
      );
      expect(updated.sale.notes).toBe("yeni");
    });

    it("tamamlanmış satış güncellenemez 409 VET-CLINIC_SALE-0003", async () => {
      const pid = await seedProduct("CS-UP2");
      const created = await service.createClinicSale(
        TENANT_A,
        makeSaleInput(pid),
        OWNER_A,
      );
      await service.completeClinicSale(
        TENANT_A,
        created.sale.id,
        OWNER_A,
      );
      await expect(
        service.updateClinicSale(
          TENANT_A,
          created.sale.id,
          { notes: "x" },
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC_SALE-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const pid = await seedProduct("CS-CISO");
      await expect(
        service.createClinicSale(
          TENANT_B,
          makeSaleInput(pid, { sourceId: "e-ciso" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
