/**
 * @file StockAlertsService unit testleri.
 * @module apps/api/modules/stock-alerts/stock-alerts.service.spec
 *
 * @description GOAL-067 düşük stok ve SKT uyarıları service testleri.
 *   - Compute (düşük stok + SKT) çalışması.
 *   - Eşik kontrolü (qty <= threshold).
 *   - SKT gün hesabı (geçmiş, kritik, uyarı).
 *   - Severity (warning/critical/expired).
 *   - Acknowledge state (idempotent, status transition).
 *   - Refresh ack'ları korur / sıfırlar.
 *   - Cross-tenant tenant izolasyonu (403 VET-AUTHZ-0001).
 *   - Uyarı bulunamadı (404 VET-STOCK_ALERT-0001).
 *   - Çözülmüş uyarı ack (422 VET-STOCK_ALERT-0003).
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { StockAlertAcksRepository } from "./stock-alert-acks.repository.js";
import { StockAlertsService } from "./stock-alerts.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  ProductCreateInput,
  StockLotCreateInput,
  StockMovementCreateInput,
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

function makeProductInput(
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
    purchasePrice: "10",
    salePrice: "20",
    ...overrides,
  };
}

function makeLotInput(
  productId: string,
  expiryDate: string,
  overrides: Partial<StockLotCreateInput> = {},
): StockLotCreateInput {
  return {
    productId,
    lotNumber: `L-${Math.random().toString(36).slice(2, 8)}`,
    expiryDate,
    ...overrides,
  };
}

function makeMovementInput(
  productId: string,
  quantity: string,
  lotId: string | null = null,
  overrides: Partial<StockMovementCreateInput> = {},
): StockMovementCreateInput {
  return {
    type: "purchase",
    productId,
    lotId: lotId ?? undefined,
    quantity,
    sourceType: "manual",
    sourceId: "manual",
    ...overrides,
  };
}

interface TestContext {
  service: StockAlertsService;
  acks: StockAlertAcksRepository;
  productsService: ProductsService;
  inventoryService: InventoryService;
  stockMovementsService: StockMovementsService;
  productsRepo: ProductsRepository;
  inventoryRepo: InventoryRepository;
  audit: AuditService;
}

function makeContext(): TestContext {
  const productsRepo = new ProductsRepository();
  const inventoryRepo = new InventoryRepository();
  const stockMovementsRepo = new StockMovementsRepository();
  const audit = makeAudit();
  const productsService = new ProductsService(productsRepo, audit);
  const inventoryService = new InventoryService(inventoryRepo, audit);
  const stockMovementsService = new StockMovementsService(
    stockMovementsRepo,
    productsService,
    inventoryService,
    audit,
  );
  const acks = new StockAlertAcksRepository();
  const service = new StockAlertsService(
    productsService,
    inventoryService,
    stockMovementsService,
    acks,
    audit,
  );
  return {
    service,
    acks,
    productsService,
    inventoryService,
    stockMovementsService,
    productsRepo,
    inventoryRepo,
    audit,
  };
}

function futureIso(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString();
}

function pastIso(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

describe("StockAlertsService — GOAL-067", () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = makeContext();
  });

  // ===========================================================================
  // Düşük stok
  // ===========================================================================

  describe("düşük stok uyarıları", () => {
    it("eşik altındaki ürün için uyarı oluşturur (warning)", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      // Stok: 3 adet (purchase hareketi).
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );

      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.productId).toBe(p.id);
      expect(result.items[0]?.currentQuantity).toBe("3");
      expect(result.items[0]?.threshold).toBe("5");
      expect(result.items[0]?.severity).toBe("warning");
      expect(result.items[0]?.status).toBe("active");
    });

    it("qty=0 için severity=critical", async () => {
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      // Hiç stok hareketi yok (qty=0).
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.severity).toBe("critical");
      expect(result.items[0]?.currentQuantity).toBe("0");
    });

    it("qty>threshold için uyarı oluşmaz", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "10"),
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });

    it("purchaseTracked=false ürünler için uyarı oluşmaz", async () => {
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5", purchaseTracked: false }),
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });

    it("lowStockThreshold=null ürünler için uyarı oluşmaz", async () => {
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: undefined }),
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });

    it("arşivlenmiş ürün için uyarı oluşmaz", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.productsService.archiveProduct(
        TENANT_A,
        p.id,
        { reason: "test" },
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });
  });

  // ===========================================================================
  // SKT
  // ===========================================================================

  describe("SKT uyarıları", () => {
    it("geçmiş SKT için severity=expired", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      // Geçmiş SKT'li lot oluşturmak service tarafından engellenir
      // (VET-INV-0009); bu yüzden doğrudan repo üzerinden insert
      // yapıyoruz.
      const nowIso = new Date().toISOString();
      ctx.inventoryRepo.insertLot({
        id: ctx.inventoryRepo.nextLotId(TENANT_A),
        tenantId: TENANT_A,
        productId: p.id,
        lotNumber: "L-EXPIRED",
        expiryDate: pastIso(5),
        manufacturedAt: null,
        receivedAt: nowIso,
        supplierName: null,
        shelfId: null,
        quantity: "10",
        notes: null,
        active: true,
        createdAt: nowIso,
        createdBy: "system",
        updatedAt: nowIso,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      });
      const result = await ctx.service.listExpiringLots(
        TENANT_A,
        { daysAhead: 30, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.severity).toBe("expired");
      expect(result.items[0]?.daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it("1-7 gün kalan SKT için severity=critical", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(5)),
        STAFF_A,
      );
      const result = await ctx.service.listExpiringLots(
        TENANT_A,
        { daysAhead: 30, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.severity).toBe("critical");
    });

    it("8-30 gün kalan SKT için severity=warning", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(15)),
        STAFF_A,
      );
      const result = await ctx.service.listExpiringLots(
        TENANT_A,
        { daysAhead: 30, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.severity).toBe("warning");
    });

    it("daysAhead dışındaki lotlar uyarı oluşturmaz", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(120)),
        STAFF_A,
      );
      const result = await ctx.service.listExpiringLots(
        TENANT_A,
        { daysAhead: 30, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });

    it("arşivlenmiş lot için uyarı oluşmaz", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      const lot = await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(5)),
        STAFF_A,
      );
      await ctx.inventoryService.archiveLot(
        TENANT_A,
        lot.id,
        { reason: "test" },
        STAFF_A,
      );
      const result = await ctx.service.listExpiringLots(
        TENANT_A,
        { daysAhead: 30, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });
  });

  // ===========================================================================
  // Acknowledge
  // ===========================================================================

  describe("acknowledge", () => {
    it("düşük stok uyarısı acknowledge → status=acknowledged", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      // Stok: 3 (eşik altı).
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );
      const acked = await ctx.service.acknowledgeLowStock(
        TENANT_A,
        p.id,
        "takipteyim",
        STAFF_A,
      );
      expect(acked.status).toBe("acknowledged");
      expect(acked.acknowledgedBy).toBe("usr-staff-a");
      expect(acked.acknowledgedAt).not.toBeNull();
    });

    it("acknowledge idempotent", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );
      const first = await ctx.service.acknowledgeLowStock(
        TENANT_A,
        p.id,
        undefined,
        STAFF_A,
      );
      const second = await ctx.service.acknowledgeLowStock(
        TENANT_A,
        p.id,
        undefined,
        STAFF_A,
      );
      expect(first.acknowledgedAt).toBe(second.acknowledgedAt);
    });

    it("SKT uyarısı acknowledge", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      const lot = await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(5)),
        STAFF_A,
      );
      const acked = await ctx.service.acknowledgeExpiringLot(
        TENANT_A,
        lot.id,
        undefined,
        STAFF_A,
      );
      expect(acked.status).toBe("acknowledged");
    });

    it("uyarı yoksa 404 VET-STOCK_ALERT-0001", async () => {
      // Ürün var ama threshold yok.
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      await expect(
        ctx.service.acknowledgeLowStock(TENANT_A, p.id, undefined, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-STOCK_ALERT-0001",
        httpStatus: 404,
      });
    });

    it("SKT uyarısı yoksa 404 VET-STOCK_ALERT-0001", async () => {
      // Lot var ama SKT uzağı.
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      const lot = await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p.id, futureIso(200)),
        STAFF_A,
      );
      await expect(
        ctx.service.acknowledgeExpiringLot(
          TENANT_A,
          lot.id,
          undefined,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-STOCK_ALERT-0001",
        httpStatus: 404,
      });
    });
  });

  // ===========================================================================
  // Refresh
  // ===========================================================================

  describe("refresh", () => {
    it("ack'lar korunur (default)", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );
      await ctx.service.acknowledgeLowStock(TENANT_A, p.id, undefined, STAFF_A);
      // Refresh: ack korunur.
      const result = await ctx.service.refresh(TENANT_A, undefined, STAFF_A);
      expect(result.lowStockAlertCount).toBe(0); // acknowledged → active filtresi 0
      // listLowStock acknowledged da getirir (status filtresi).
      const list = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.items[0]?.status).toBe("acknowledged");
    });

    it("resetAcknowledgements=true ack'ları sıfırlar", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );
      await ctx.service.acknowledgeLowStock(TENANT_A, p.id, undefined, STAFF_A);
      await ctx.service.refresh(
        TENANT_A,
        { resetAcknowledgements: true },
        STAFF_A,
      );
      const list = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.items[0]?.status).toBe("active");
    });
  });

  // ===========================================================================
  // Summary
  // ===========================================================================

  describe("summary", () => {
    it("doğru sayıları döner", async () => {
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      const p2 = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      // p1: 0 (critical), p2: 3 (warning)
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p2.id, "3"),
        STAFF_A,
      );
      const p3 = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput(),
        STAFF_A,
      );
      // SKT: 3 gün (critical)
      await ctx.inventoryService.createLot(
        TENANT_A,
        makeLotInput(p3.id, futureIso(3)),
        STAFF_A,
      );
      const sum = await ctx.service.summary(TENANT_A, STAFF_A);
      expect(sum.lowStockAlertCount).toBe(2);
      expect(sum.criticalLowStockCount).toBe(1);
      expect(sum.expiringLotAlertCount).toBe(1);
      expect(sum.criticalLotCount).toBe(1);
    });
  });

  // ===========================================================================
  // Tenant izolasyonu
  // ===========================================================================

  describe("tenant izolasyonu", () => {
    it("cross-tenant listLowStock → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.listLowStock(TENANT_A, { limit: 50, offset: 0 }, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant listExpiringLots → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.listExpiringLots(
          TENANT_A,
          { limit: 50, offset: 0, daysAhead: 30 },
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant acknowledgeLowStock → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.acknowledgeLowStock(TENANT_A, "prd-x", undefined, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant acknowledgeExpiringLot → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.acknowledgeExpiringLot(
          TENANT_A,
          "lot-x",
          undefined,
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant refresh → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.refresh(TENANT_A, undefined, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant summary → 403 VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.summary(TENANT_A, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("SUPERADMIN tüm tenantlarda erişebilir", async () => {
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { limit: 50, offset: 0 },
        SUPERADMIN,
      );
      expect(result.total).toBe(1);
    });
  });

  // ===========================================================================
  // Filtreler
  // ===========================================================================

  describe("filtreler", () => {
    it("severity=warning filtresi", async () => {
      const p1 = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p1.id, "3"),
        STAFF_A,
      );
      // p2: 0 (critical)
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { severity: "warning", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.productId).toBe(p1.id);
    });

    it("activeOnly filtresi acknowledged'ı gizler", async () => {
      const p = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p.id, "3"),
        STAFF_A,
      );
      await ctx.service.acknowledgeLowStock(TENANT_A, p.id, undefined, STAFF_A);
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { activeOnly: true, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(0);
    });

    it("productId filtresi", async () => {
      const p1 = await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.productsService.createProduct(
        TENANT_A,
        makeProductInput({ lowStockThreshold: "5" }),
        STAFF_A,
      );
      await ctx.stockMovementsService.createMovement(
        TENANT_A,
        makeMovementInput(p1.id, "3"),
        STAFF_A,
      );
      const result = await ctx.service.listLowStock(
        TENANT_A,
        { productId: p1.id, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.productId).toBe(p1.id);
    });
  });
});
