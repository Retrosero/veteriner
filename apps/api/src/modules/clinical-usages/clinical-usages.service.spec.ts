/**
 * @file ClinicalUsagesService unit testleri.
 * @module apps/api/modules/clinical-usages/clinical-usages.service.spec
 * @description GOAL-066 klinik tüketimden otomatik stok düşümü
 *   service testleri.
 *   - recordUsage (purchaseTracked → clinical_use hareketi).
 *   - service türünde ürün reddedilir 422 VET-CLINICAL-USE-0004.
 *   - arşivli ürün reddedilir 422 VET-CLINICAL-USE-0003.
 *   - idempotency: aynı key + aynı body → mevcut kayıt döner
 *     (stok hareketi yeniden oluşmaz).
 *   - idempotency: aynı key + farklı body → 409 VET-CLINICAL-USE-0005.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClinicalUsagesRepository } from "./clinical-usages.repository.js";
import { ClinicalUsagesService } from "./clinical-usages.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  ClinicalUsageCreateInput,
  ProductCreateInput,
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

/**
 *
 */
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

/**
 *
 * @param overrides
 */
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
    ...overrides,
  };
}

/**
 *
 * @param productId
 * @param overrides
 */
function makeUsageInput(
  productId: string,
  overrides: Partial<ClinicalUsageCreateInput> = {},
): ClinicalUsageCreateInput {
  return {
    sourceType: "examination",
    sourceId: "exam-001",
    lines: [{ productId, unit: "unit", quantity: "3" }],
    ...overrides,
  };
}

describe("ClinicalUsagesService", () => {
  let service: ClinicalUsagesService;
  let usageRepo: ClinicalUsagesRepository;
  let productsService: ProductsService;
  let stockService: StockMovementsService;
  let audit: AuditService;

  beforeEach(() => {
    usageRepo = new ClinicalUsagesRepository();
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
    service = new ClinicalUsagesService(
      usageRepo,
      productsService,
      stockService,
      audit,
    );
  });

  /**
   *
   * @param sku
   * @param kind
   * @param purchaseTracked
   */
  async function seedProduct(
    sku: string,
    kind: ProductCreateInput["kind"] = "stock_product",
    purchaseTracked: boolean = true,
  ): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      {
        ...makeProductInput({ kind, name: `Ürün ${sku}`, purchaseTracked }),
        sku,
      },
      STAFF_A,
    );
    return p.id;
  }

  // ---------------------------------------------------------------------------
  // recordUsage
  // ---------------------------------------------------------------------------

  describe("recordUsage", () => {
    it("kayıt oluşturur + clinical_use stok hareketi", async () => {
      const pid = await seedProduct("CU-1");
      const out = await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, { sourceType: "examination", sourceId: "e-1" }),
        STAFF_A,
      );
      expect(out.usage.id).toMatch(/^cu-/);
      expect(out.usage.sourceType).toBe("examination");
      expect(out.lines.length).toBe(1);
      // Bakiye: -3 (3 adet tüketildi)
      const balances = stockService.listBalances(TENANT_A, STAFF_A, {
        productId: pid,
      });
      expect(balances.items[0]?.netQuantity).toBe("-3");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical_usage.create",
        "clinical_usage",
        out.usage.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ sourceType: "examination" }),
      );
    });

    it("purchaseTracked=false ürün için stok hareketi oluşmaz", async () => {
      const pid = await seedProduct("CU-2", "consumable", false);
      const out = await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, { sourceType: "surgery", sourceId: "s-1" }),
        STAFF_A,
      );
      expect(out.lines.length).toBe(1);
      const balances = stockService.listBalances(TENANT_A, STAFF_A, {
        productId: pid,
      });
      expect(balances.items.length).toBe(0);
    });

    it("service türünde ürün reddedilir 422 VET-CLINICAL-USE-0004", async () => {
      const pid = await seedProduct("CU-3", "service", false);
      await expect(
        service.recordUsage(
          TENANT_A,
          makeUsageInput(pid, { sourceType: "examination", sourceId: "e-2" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL-USE-0004",
        httpStatus: 422,
      });
    });

    it("ürün yoksa 422 VET-CLINICAL-USE-0003", async () => {
      await expect(
        service.recordUsage(
          TENANT_A,
          makeUsageInput("00000000-0000-0000-0000-000000000000", {
            sourceType: "examination",
            sourceId: "e-3",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL-USE-0003",
        httpStatus: 422,
      });
    });

    it("arşivli ürün reddedilir 422 VET-CLINICAL-USE-0003", async () => {
      const pid = await seedProduct("CU-4");
      await productsService.archiveProduct(
        TENANT_A,
        pid,
        { reason: "eski" },
        STAFF_A,
      );
      await expect(
        service.recordUsage(
          TENANT_A,
          makeUsageInput(pid, { sourceType: "examination", sourceId: "e-4" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL-USE-0003",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("aynı key + aynı body → mevcut kayıt döner (stok hareketi yeniden oluşmaz)", async () => {
      const pid = await seedProduct("CU-IDEM-1");
      const first = await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "examination",
          sourceId: "e-idem",
          idempotencyKey: "k-1",
        }),
        STAFF_A,
      );
      const second = await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "examination",
          sourceId: "e-idem",
          idempotencyKey: "k-1",
        }),
        STAFF_A,
      );
      expect(second.usage.id).toBe(first.usage.id);
      // Bakiye hâlâ -3 (toplam tek hareket).
      const balances = stockService.listBalances(TENANT_A, STAFF_A, {
        productId: pid,
      });
      expect(balances.items[0]?.netQuantity).toBe("-3");
    });

    it("aynı key + farklı body → 409 VET-CLINICAL-USE-0005", async () => {
      const pid = await seedProduct("CU-IDEM-2");
      await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "examination",
          sourceId: "e-idem-2",
          idempotencyKey: "k-2",
        }),
        STAFF_A,
      );
      await expect(
        service.recordUsage(
          TENANT_A,
          makeUsageInput(pid, {
            sourceType: "surgery", // farklı sourceType
            sourceId: "e-idem-2",
            idempotencyKey: "k-2",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL-USE-0005",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listUsages / getUsageDetail
  // ---------------------------------------------------------------------------

  describe("listUsages", () => {
    it("tenant-scoped; sourceType filtresi çalışır", async () => {
      const pid = await seedProduct("CU-LIST");
      await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "examination",
          sourceId: "e-l1",
        }),
        STAFF_A,
      );
      await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "surgery",
          sourceId: "s-l1",
        }),
        STAFF_A,
      );
      const list = await service.listUsages(
        TENANT_A,
        { sourceType: "examination", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.sourceType).toBe("examination");
    });
  });

  describe("getUsageDetail", () => {
    it("cross-tenant IDOR → null", async () => {
      const pid = await seedProduct("CU-ISO");
      const created = await service.recordUsage(
        TENANT_A,
        makeUsageInput(pid, {
          sourceType: "examination",
          sourceId: "e-iso",
        }),
        STAFF_A,
      );
      const detail = await service.getUsageDetail(
        TENANT_B,
        created.usage.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const pid = await seedProduct("CU-CISO");
      await expect(
        service.recordUsage(
          TENANT_B,
          makeUsageInput(pid, {
            sourceType: "examination",
            sourceId: "e-ciso",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
