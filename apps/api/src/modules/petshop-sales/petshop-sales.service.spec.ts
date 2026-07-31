/**
 * @file PetshopSalesService unit testleri.
 * @module apps/api/modules/petshop-sales/petshop-sales.service.spec
 *
 * @description GOAL-064 petshop POS service testleri.
 *   - Taslak oluşturma (satır toplamı + indirim + audit).
 *   - Tamamlama (stock-movements'a `sale` hareketi gönderimi +
 *     audit).
 *   - İptal (draft/completed → cancelled; completed için
 *     `reversal` hareketi; audit).
 *   - Ürün arşivliyse 422 VET-SALE-0006.
 *   - Tamamlanmış satış güncellenemez 409 VET-SALE-0003.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { PetshopSalesService } from "./petshop-sales.service.js";
import { PetshopSalesRepository } from "./petshop-sales.repository.js";
import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import type {
  PetshopSaleCancelInput,
  PetshopSaleCompleteInput,
  PetshopSaleCreateInput,
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
    kind: "stock_product",
    name: "Test Ürün",
    unit: "unit",
    taxProfile: "standard",
    currency: "TRY",
    clinicUsage: false,
    petshopUsage: true,
    saleAvailable: true,
    purchaseTracked: true,
    requiresPrescription: false,
    controlledDrug: false,
    salePrice: "50",
    purchasePrice: "30",
    ...overrides,
  };
}

function makeSaleInput(
  productId: string,
  overrides: Partial<PetshopSaleCreateInput> = {},
): PetshopSaleCreateInput {
  return {
    paymentMethod: "cash",
    paidAmount: "100",
    globalDiscountPercent: 0,
    lines: [
      {
        productId,
        unit: "unit",
        quantity: "2",
        unitPrice: "50",
        discountPercent: 0,
      },
    ],
    ...overrides,
  };
}

describe("PetshopSalesService", () => {
  let service: PetshopSalesService;
  let saleRepo: PetshopSalesRepository;
  let productsService: ProductsService;
  let stockService: StockMovementsService;
  let audit: AuditService;

  beforeEach(() => {
    saleRepo = new PetshopSalesRepository();
    audit = makeAudit();
    const productRepo = new ProductsRepository();
    productsService = new ProductsService(productRepo, audit);
    const stockRepo = new StockMovementsRepository();
    const inventoryService = new InventoryService(
      new InventoryRepository(),
      audit,
    );
    stockService = new StockMovementsService(
      stockRepo,
      productsService,
      inventoryService,
      audit,
    );
    service = new PetshopSalesService(
      saleRepo,
      productsService,
      stockService,
      audit,
    );
  });

  async function seedProduct(
    code: string,
    name: string,
    salePrice: string = "50",
  ): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      {
        ...makeProductInput({ name, salePrice }),
        sku: code,
      },
      STAFF_A,
    );
    return p.id;
  }

  // ---------------------------------------------------------------------------
  // createSale
  // ---------------------------------------------------------------------------

  describe("createSale", () => {
    it("taslak satış oluşturur + totalAmount + audit", async () => {
      const pid = await seedProduct("SKU-A-1", "Ürün A", "50");
      const out = await service.createSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [
            { productId: pid, unit: "unit", quantity: "2", unitPrice: "50" },
            { productId: pid, unit: "unit", quantity: "3", unitPrice: "40" },
          ],
        }),
        STAFF_A,
      );
      expect(out.sale.id).toMatch(/^ps-/);
      expect(out.sale.status).toBe("draft");
      expect(out.sale.totalAmount).toBe("220"); // 100 + 120
      expect(out.sale.netAmount).toBe("220");
      expect(out.lines.length).toBe(2);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:petshop_sale.create",
        "petshop_sale",
        out.sale.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ lineCount: 2 }),
      );
    });

    it("global indirim uygular", async () => {
      const pid = await seedProduct("SKU-GD", "Ürün GD", "100");
      const out = await service.createSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [
            { productId: pid, unit: "unit", quantity: "2", unitPrice: "100" },
          ],
          globalDiscountPercent: 10,
        }),
        STAFF_A,
      );
      // 200 - %10 = 180
      expect(out.sale.totalAmount).toBe("200");
      expect(out.sale.netAmount).toBe("180");
    });

    it("satır indirimi uygular", async () => {
      const pid = await seedProduct("SKU-LD", "Ürün LD", "100");
      const out = await service.createSale(
        TENANT_A,
        makeSaleInput(pid, {
          lines: [
            {
              productId: pid,
              unit: "unit",
              quantity: "2",
              unitPrice: "100",
              discountPercent: 25,
            },
          ],
        }),
        STAFF_A,
      );
      // 200 * 0.75 = 150
      expect(out.sale.totalAmount).toBe("150");
    });

    it("ürün arşivliyse 422 VET-SALE-0006", async () => {
      const pid = await seedProduct("SKU-ARC", "Ürün Arşivli", "50");
      await productsService.archiveProduct(
        TENANT_A,
        pid,
        { reason: "eski" },
        STAFF_A,
      );
      await expect(
        service.createSale(
          TENANT_A,
          makeSaleInput(pid),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SALE-0006",
        httpStatus: 422,
      });
    });

    it("ürün yoksa 422 VET-SALE-0006", async () => {
      await expect(
        service.createSale(
          TENANT_A,
          makeSaleInput("00000000-0000-0000-0000-000000000000"),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SALE-0006",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // completeSale
  // ---------------------------------------------------------------------------

  describe("completeSale", () => {
    it("draft → completed + sale stok hareketi oluşturur", async () => {
      const pid = await seedProduct("SKU-CMP", "Ürün CMP", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      const completed = await service.completeSale(
        TENANT_A,
        created.sale.id,
        {} as PetshopSaleCompleteInput,
        STAFF_A,
      );
      expect(completed.sale.status).toBe("completed");
      expect(completed.sale.completedAt).not.toBeNull();
      expect(completed.sale.completedBy).toBe("usr-staff-a");
      // Satış tipinde en az 1 hareket oluşmalı.
      const balances = await stockService.listBalances(
        TENANT_A,
        STAFF_A,
        { productId: pid },
      );
      expect(balances.items.length).toBe(1);
      // net quantity = -2 (çıkış)
      expect(balances.items[0]?.netQuantity).toBe("-2");
    });

    it("draft olmayan satış tamamlanamaz 409 VET-SALE-0002", async () => {
      const pid = await seedProduct("SKU-CMP2", "Ürün CMP2", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      await service.completeSale(
        TENANT_A,
        created.sale.id,
        {} as PetshopSaleCompleteInput,
        STAFF_A,
      );
      await expect(
        service.completeSale(
          TENANT_A,
          created.sale.id,
          {} as PetshopSaleCompleteInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SALE-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateSale
  // ---------------------------------------------------------------------------

  describe("updateSale", () => {
    it("taslak satışta notes günceller", async () => {
      const pid = await seedProduct("SKU-UP", "Ürün UP", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      const updated = await service.updateSale(
        TENANT_A,
        created.sale.id,
        { notes: "yeni" },
        STAFF_A,
      );
      expect(updated.sale.notes).toBe("yeni");
    });

    it("tamamlanmış satış güncellenemez 409 VET-SALE-0003", async () => {
      const pid = await seedProduct("SKU-UP2", "Ürün UP2", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      await service.completeSale(
        TENANT_A,
        created.sale.id,
        {} as PetshopSaleCompleteInput,
        STAFF_A,
      );
      await expect(
        service.updateSale(
          TENANT_A,
          created.sale.id,
          { notes: "x" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SALE-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelSale
  // ---------------------------------------------------------------------------

  describe("cancelSale", () => {
    it("draft → cancelled (stok hareketi yok)", async () => {
      const pid = await seedProduct("SKU-CNL", "Ürün CNL", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      const cancelled = await service.cancelSale(
        TENANT_A,
        created.sale.id,
        { reason: "yanlışlık" } as PetshopSaleCancelInput,
        STAFF_A,
      );
      expect(cancelled.sale.status).toBe("cancelled");
      expect(cancelled.sale.cancelReason).toBe("yanlışlık");
    });

    it("completed → cancelled + reversal stok hareketi", async () => {
      const pid = await seedProduct("SKU-CC", "Ürün CC", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      await service.completeSale(
        TENANT_A,
        created.sale.id,
        {} as PetshopSaleCompleteInput,
        STAFF_A,
      );
      const cancelled = await service.cancelSale(
        TENANT_A,
        created.sale.id,
        { reason: "iade" } as PetshopSaleCancelInput,
        STAFF_A,
      );
      expect(cancelled.sale.status).toBe("cancelled");
      // Net bakiye 0 olmalı (sale -2 + reversal +2 = 0).
      const balances = await stockService.listBalances(
        TENANT_A,
        STAFF_A,
        { productId: pid },
      );
      expect(balances.items[0]?.netQuantity).toBe("0");
    });

    it("zaten iptal edilmiş → 409 VET-SALE-0004", async () => {
      const pid = await seedProduct("SKU-CC2", "Ürün CC2", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      await service.cancelSale(
        TENANT_A,
        created.sale.id,
        { reason: "ilk" } as PetshopSaleCancelInput,
        STAFF_A,
      );
      await expect(
        service.cancelSale(
          TENANT_A,
          created.sale.id,
          { reason: "ikinci" } as PetshopSaleCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SALE-0004",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant IDOR → null", async () => {
      const pid = await seedProduct("SKU-ISO", "Ürün ISO", "50");
      const created = await service.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      const detail = await service.getSaleDetail(
        TENANT_B,
        created.sale.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const pid = await seedProduct("SKU-CISO", "Ürün CISO", "50");
      await expect(
        service.createSale(
          TENANT_B,
          makeSaleInput(pid),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
