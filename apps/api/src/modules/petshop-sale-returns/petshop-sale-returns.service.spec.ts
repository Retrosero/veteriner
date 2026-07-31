/**
 * @file PetshopSaleReturnsService unit testleri.
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.service.spec
 *
 * @description GOAL-065 petshop satış iadesi service testleri.
 *   - createReturn: completed sale → draft return (audit).
 *   - createReturn: satış bulunamadı / completed değil / orijinal
 *     satır yok / miktar aşımı / lot yok / lot arşivli / lot ürün
 *     uyumsuz → uygun hata kodları.
 *   - listReturns: tenant-scoped filtreler.
 *   - completeReturn: stock-movements'a `return` hareketi gönderimi
 *     + audit.
 *   - cancelReturn: draft → cancelled; cancelled/completed → 409.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { PetshopSaleReturnsService } from "./petshop-sale-returns.service.js";
import { PetshopSaleReturnsRepository } from "./petshop-sale-returns.repository.js";
import { PetshopSalesService } from "../petshop-sales/petshop-sales.service.js";
import { PetshopSalesRepository } from "../petshop-sales/petshop-sales.repository.js";
import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import type {
  PetshopSaleCompleteInput,
  PetshopSaleCreateInput,
  PetshopSaleReturnCancelInput,
  PetshopSaleReturnCreateInput,
  ProductCreateInput,
  StockLotCreateInput,
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

describe("PetshopSaleReturnsService", () => {
  let returnsService: PetshopSaleReturnsService;
  let returnsRepo: PetshopSaleReturnsRepository;
  let salesService: PetshopSalesService;
  let salesRepo: PetshopSalesRepository;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let stockService: StockMovementsService;
  let audit: AuditService;

  beforeEach(() => {
    audit = makeAudit();
    returnsRepo = new PetshopSaleReturnsRepository();
    salesRepo = new PetshopSalesRepository();
    const productRepo = new ProductsRepository();
    productsService = new ProductsService(productRepo, audit);
    inventoryService = new InventoryService(
      new InventoryRepository(),
      audit,
    );
    const stockRepo = new StockMovementsRepository();
    stockService = new StockMovementsService(
      stockRepo,
      productsService,
      inventoryService,
      audit,
    );
    salesService = new PetshopSalesService(
      salesRepo,
      productsService,
      stockService,
      audit,
    );
    returnsService = new PetshopSaleReturnsService(
      returnsRepo,
      salesRepo,
      productsService,
      inventoryService,
      stockService,
      audit,
    );
  });

  async function seedProduct(
    code: string,
    name: string,
    salePrice: string = "50",
    overrides: Partial<ProductCreateInput> = {},
  ): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      {
        ...makeProductInput({ name, salePrice, ...overrides }),
        sku: code,
      },
      STAFF_A,
    );
    return p.id;
  }

  async function seedCompletedSale(
    productId: string,
  ): Promise<{ saleId: string; lineId: string }> {
    const created = await salesService.createSale(
      TENANT_A,
      makeSaleInput(productId),
      STAFF_A,
    );
    const completed = await salesService.completeSale(
      TENANT_A,
      created.sale.id,
      {} as PetshopSaleCompleteInput,
      STAFF_A,
    );
    const lineId = created.lines[0]!.id;
    return { saleId: completed.sale.id, lineId };
  }

  async function seedLot(productId: string): Promise<string> {
    // Gelecek bir tarih (SKT geçerli).
    const expiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 365,
    ).toISOString();
    const lotInput: StockLotCreateInput = {
      productId,
      lotNumber: `LOT-${Math.random().toString(36).slice(2, 8)}`,
      expiryDate: expiry,
      receivedAt: new Date().toISOString(),
      quantity: "10",
    };
    const lot = await inventoryService.createLot(
      TENANT_A,
      lotInput,
      STAFF_A,
    );
    return lot.id;
  }

  // ---------------------------------------------------------------------------
  // createReturn
  // ---------------------------------------------------------------------------

  describe("createReturn", () => {
    it("completed sale → draft return + audit", async () => {
      const pid = await seedProduct("SKU-R1", "Ürün R1", "50");
      const { saleId, lineId } = await seedCompletedSale(pid);
      const out = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "müşteri vazgeçti",
          lines: [
            {
              originalLineId: lineId,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
              discountPercent: 0,
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      expect(out.return.status).toBe("draft");
      expect(out.return.refundAmount).toBe("50");
      expect(out.lines.length).toBe(1);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:petshop_sale_return.create",
        "petshop_sale_return",
        out.return.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ originalSaleId: saleId }),
      );
    });

    it("orijinal satış bulunamadı → 404 VET-RETURN-0001", async () => {
      const pid = await seedProduct("SKU-RNF", "Ürün RNF", "50");
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: "ps-bilinmiyor",
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: "psl-x",
                productId: pid,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0001",
        httpStatus: 404,
      });
    });

    it("completed olmayan satış iade edilemez → 422 VET-RETURN-0002", async () => {
      const pid = await seedProduct("SKU-NC", "Ürün NC", "50");
      const draft = await salesService.createSale(
        TENANT_A,
        makeSaleInput(pid),
        STAFF_A,
      );
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: draft.sale.id,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: draft.lines[0]!.id,
                productId: pid,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0002",
        httpStatus: 422,
      });
    });

    it("iade miktarı orijinal satışı aşarsa → 422 VET-RETURN-0003", async () => {
      const pid = await seedProduct("SKU-OVER", "Ürün OVER", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "çok fazla",
            lines: [
              {
                originalLineId: origLine,
                productId: pid,
                unit: "unit",
                quantity: "5",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0003",
        httpStatus: 422,
      });
    });

    it("orijinal satır bulunamadı → 422 VET-RETURN-0004", async () => {
      const pid = await seedProduct("SKU-NL", "Ürün NL", "50");
      const { saleId } = await seedCompletedSale(pid);
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: "psl-bilinmiyor",
                productId: pid,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0004",
        httpStatus: 422,
      });
    });

    it("ürün uyumsuz → 422 VET-RETURN-0004", async () => {
      const pid1 = await seedProduct("SKU-PM1", "Ürün PM1", "50");
      const pid2 = await seedProduct("SKU-PM2", "Ürün PM2", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid1);
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: origLine,
                productId: pid2,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0004",
        httpStatus: 422,
      });
    });

    it("lot bulunamadı → 404 VET-RETURN-0006", async () => {
      const pid = await seedProduct("SKU-LNF", "Ürün LNF", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: origLine,
                productId: pid,
                lotId: "stl-bilinmiyor",
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0006",
        httpStatus: 404,
      });
    });

    it("lot arşivli → 409 VET-RETURN-0007", async () => {
      const pid = await seedProduct("SKU-LAR", "Ürün LAR", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const lotId = await seedLot(pid);
      await inventoryService.archiveLot(
        TENANT_A,
        lotId,
        { reason: "eski" },
        STAFF_A,
      );
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: origLine,
                productId: pid,
                lotId,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0007",
        httpStatus: 409,
      });
    });

    it("lot ürün uyumsuz → 422 VET-RETURN-0008", async () => {
      const pid1 = await seedProduct("SKU-LP1", "Ürün LP1", "50");
      const pid2 = await seedProduct("SKU-LP2", "Ürün LP2", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid1);
      const lotId = await seedLot(pid2);
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: origLine,
                productId: pid1,
                lotId,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0008",
        httpStatus: 422,
      });
    });

    it("global indirim uygular", async () => {
      const pid = await seedProduct("SKU-GD2", "Ürün GD2", "100");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const out = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 10,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "100",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      expect(out.return.totalAmount).toBe("100");
      expect(out.return.refundAmount).toBe("90");
    });
  });

  // ---------------------------------------------------------------------------
  // listReturns
  // ---------------------------------------------------------------------------

  describe("listReturns", () => {
    it("tenant-scoped arama yapar", async () => {
      const pid = await seedProduct("SKU-LS1", "Ürün LS1", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      const out = await returnsService.listReturns(
        TENANT_A,
        { status: "draft", limit: 50, offset: 0 } as never,
        STAFF_A,
      );
      expect(out.items.length).toBe(1);
      expect(out.total).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getReturnDetail
  // ---------------------------------------------------------------------------

  describe("getReturnDetail", () => {
    it("cross-tenant → null", async () => {
      const pid = await seedProduct("SKU-ISO2", "Ürün ISO2", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      const detail = await returnsService.getReturnDetail(
        TENANT_B,
        created.return.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // completeReturn
  // ---------------------------------------------------------------------------

  describe("completeReturn", () => {
    it("draft → completed + return stok hareketi oluşturur", async () => {
      const pid = await seedProduct("SKU-CMP3", "Ürün CMP3", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      const completed = await returnsService.completeReturn(
        TENANT_A,
        created.return.id,
        undefined,
        STAFF_A,
      );
      expect(completed.return.status).toBe("completed");
      expect(completed.return.completedAt).not.toBeNull();
      // Sale -2 + return +1 = -1 net
      const balances = await stockService.listBalances(
        TENANT_A,
        STAFF_A,
        { productId: pid },
      );
      expect(balances.items[0]?.netQuantity).toBe("-1");
    });

    it("purchaseTracked olmayan üründe stok hareketi oluşturmaz", async () => {
      const pid = await seedProduct(
        "SKU-PT0",
        "Ürün PT0",
        "50",
        { purchaseTracked: false },
      );
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      const before = await stockService.listMovements(
        TENANT_A,
        { limit: 50, offset: 0 } as never,
        STAFF_A,
      );
      const beforeCount = before.total;
      await returnsService.completeReturn(
        TENANT_A,
        created.return.id,
        undefined,
        STAFF_A,
      );
      const after = await stockService.listMovements(
        TENANT_A,
        { limit: 50, offset: 0 } as never,
        STAFF_A,
      );
      // Sadece tamamlama sırasında +0 hareket (satışta da yok).
      expect(after.total).toBe(beforeCount);
    });

    it("draft olmayan return tamamlanamaz → 409 VET-RETURN-0005", async () => {
      const pid = await seedProduct("SKU-NC3", "Ürün NC3", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      await returnsService.completeReturn(
        TENANT_A,
        created.return.id,
        undefined,
        STAFF_A,
      );
      await expect(
        returnsService.completeReturn(
          TENANT_A,
          created.return.id,
          undefined,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0005",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelReturn
  // ---------------------------------------------------------------------------

  describe("cancelReturn", () => {
    it("draft → cancelled", async () => {
      const pid = await seedProduct("SKU-CN1", "Ürün CN1", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      const cancelled = await returnsService.cancelReturn(
        TENANT_A,
        created.return.id,
        { reason: "yanlışlık" } as PetshopSaleReturnCancelInput,
        STAFF_A,
      );
      expect(cancelled.return.status).toBe("cancelled");
      expect(cancelled.return.cancelReason).toBe("yanlışlık");
    });

    it("zaten iptal edilmiş → 409 VET-RETURN-0005", async () => {
      const pid = await seedProduct("SKU-CN2", "Ürün CN2", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      await returnsService.cancelReturn(
        TENANT_A,
        created.return.id,
        { reason: "ilk" } as PetshopSaleReturnCancelInput,
        STAFF_A,
      );
      await expect(
        returnsService.cancelReturn(
          TENANT_A,
          created.return.id,
          { reason: "ikinci" } as PetshopSaleReturnCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0005",
        httpStatus: 409,
      });
    });

    it("completed return iptal edilemez → 409 VET-RETURN-0010", async () => {
      const pid = await seedProduct("SKU-CN3", "Ürün CN3", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      const created = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "test",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      await returnsService.completeReturn(
        TENANT_A,
        created.return.id,
        undefined,
        STAFF_A,
      );
      await expect(
        returnsService.cancelReturn(
          TENANT_A,
          created.return.id,
          { reason: "iptal" } as PetshopSaleReturnCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0010",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Kısmi iade
  // ---------------------------------------------------------------------------

  describe("kısmi iade", () => {
    it("aynı orijinal satıra 2 kez kısmi iade: toplam orijinali aşamaz", async () => {
      const pid = await seedProduct("SKU-PR1", "Ürün PR1", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      // Orijinal 2 adet satıldı; 1 adet iade et.
      const r1 = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "ilk",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      // İlk iadeyi tamamla (draft → completed; yeni iade açılabilir).
      await returnsService.completeReturn(
        TENANT_A,
        r1.return.id,
        undefined,
        STAFF_A,
      );
      // 1 adet daha iade et (toplam 2 = orijinal; geçerli).
      const r2 = await returnsService.createReturn(
        TENANT_A,
        {
          originalSaleId: saleId,
          refundMethod: "cash",
          globalDiscountPercent: 0,
          reason: "ikinci",
          lines: [
            {
              originalLineId: origLine,
              productId: pid,
              unit: "unit",
              quantity: "1",
              unitPrice: "50",
            },
          ],
        } as PetshopSaleReturnCreateInput,
        STAFF_A,
      );
      expect(r2.return.status).toBe("draft");
      // 1 adet DAHA iade et → toplam 3 > 2 orijinal → 422.
      await expect(
        returnsService.createReturn(
          TENANT_A,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "üçüncü",
            lines: [
              {
                originalLineId: origLine,
                productId: pid,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-RETURN-0003",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create → 403 VET-AUTHZ-0001", async () => {
      const pid = await seedProduct("SKU-CISO2", "Ürün CISO2", "50");
      const { saleId, lineId: origLine } = await seedCompletedSale(pid);
      await expect(
        returnsService.createReturn(
          TENANT_B,
          {
            originalSaleId: saleId,
            refundMethod: "cash",
            globalDiscountPercent: 0,
            reason: "test",
            lines: [
              {
                originalLineId: origLine,
                productId: pid,
                unit: "unit",
                quantity: "1",
                unitPrice: "50",
              },
            ],
          } as PetshopSaleReturnCreateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
