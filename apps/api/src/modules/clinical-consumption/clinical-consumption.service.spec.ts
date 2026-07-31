/**
 * @file ClinicalConsumptionService unit testleri.
 * @module apps/api/modules/clinical-consumption/clinical-consumption.service.spec
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü service testleri.
 *   - Manuel tüketim oluşturma (stok düşümü + audit).
 *   - Reçete dispense otomasyonu (recordForPrescription idempotency).
 *   - Vaccination bağlamında lot zorunluluğu.
 *   - İptal (ters kayıt oluşturma; append-only).
 *   - Tenant izolasyonu (cross-tenant → null/403).
 *   - Service/arşivli ürün reddi.
 *   - Miktar validasyonu (sıfır/negatif).
 *   - Stok bakiyesi güncellemesi (negatif).
 *   - Filtreleme (context, contextRefId, status, occurredFrom/To).
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { ClinicalConsumptionService } from "./clinical-consumption.service.js";
import { ClinicalConsumptionRepository } from "./clinical-consumption.repository.js";
import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import type {
  ClinicalConsumptionCreateInput,
  ProductCreateInput,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const VET_B: ActorContext = {
  actorId: "usr-vet-b",
  actorType: "user",
  role: "VETERINARIAN",
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
    clinicUsage: true,
    petshopUsage: false,
    saleAvailable: false,
    purchaseTracked: true,
    requiresPrescription: false,
    controlledDrug: false,
    salePrice: "50",
    purchasePrice: "30",
    ...overrides,
  };
}

describe("ClinicalConsumptionService", () => {
  let service: ClinicalConsumptionService;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let stockService: StockMovementsService;
  let consumptionRepo: ClinicalConsumptionRepository;
  let audit: AuditService;

  beforeEach(() => {
    consumptionRepo = new ClinicalConsumptionRepository();
    audit = makeAudit();
    const productRepo = new ProductsRepository();
    productsService = new ProductsService(productRepo, audit);
    const stockRepo = new StockMovementsRepository();
    inventoryService = new InventoryService(
      new InventoryRepository(),
      audit,
    );
    stockService = new StockMovementsService(
      stockRepo,
      productsService,
      inventoryService,
      audit,
    );
    service = new ClinicalConsumptionService(
      consumptionRepo,
      productsService,
      inventoryService,
      stockService,
      audit,
    );
  });

  async function seedProduct(
    sku: string,
    name: string,
    overrides: Partial<ProductCreateInput> = {},
  ): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      { ...makeProductInput(overrides), name, sku },
      VET_A,
    );
    return p.id;
  }

  async function seedProductForTenant(
    tenantId: string,
    sku: string,
    name: string,
    actor: ActorContext,
  ): Promise<string> {
    const p = await productsService.createProduct(
      tenantId,
      { ...makeProductInput({ name }), sku },
      actor,
    );
    return p.id;
  }

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: tüketim kaydı + stok düşümü (negative) + audit.create", async () => {
      const pid = await seedProduct("SKU-CC-1", "İlaç A");
      const input: ClinicalConsumptionCreateInput = {
        context: "examination",
        contextRefId: "exam-1",
        patientId: "pat-1",
        lines: [{ productId: pid, quantity: "2" }],
      };
      const out = await service.create(TENANT_A, input, VET_A);
      expect(out.id).toMatch(/^clco-/);
      expect(out.context).toBe("examination");
      expect(out.status).toBe("recorded");
      expect(out.lines.length).toBe(1);
      expect(out.stockMovementIds.length).toBe(1);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical_consumption.create",
        "clinical_consumption",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({
          context: "examination",
          lineCount: 1,
        }),
      );
    });

    it("stok bakiyesini negatif yönde günceller (clinical_use)", async () => {
      const pid = await seedProduct("SKU-CC-2", "İlaç B");
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-2",
          lines: [{ productId: pid, quantity: "3" }],
        },
        VET_A,
      );
      const balances = stockService.listBalances(TENANT_A, VET_A, {
        productId: pid,
      });
      expect(balances.items.length).toBe(1);
      expect(balances.items[0]?.netQuantity).toBe("-3");
    });

    it("vaccination context'inde lot zorunlu (422 VET-CLINICAL_CONSUMPTION-0003)", async () => {
      const pid = await seedProduct("SKU-CC-3", "Aşı A");
      await expect(
        service.create(
          TENANT_A,
          {
            context: "vaccination",
            contextRefId: "vac-1",
            lines: [{ productId: pid, quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0003",
      });
    });

    it("vaccination context'inde lot + ürün uyumu → başarı", async () => {
      const pid = await seedProduct("SKU-CC-4", "Aşı B");
      // Lot oluştur.
      const lot = await inventoryService.createLot(
        TENANT_A,
        {
          productId: pid,
          lotNumber: "LOT-V-1",
          quantity: "10",
          receivedAt: "2026-01-01T00:00:00.000Z",
          expiryDate: "2027-01-01",
        },
        VET_A,
      );
      const out = await service.create(
        TENANT_A,
        {
          context: "vaccination",
          contextRefId: "vac-2",
          lines: [{ productId: pid, lotId: lot.id, quantity: "1" }],
        },
        VET_A,
      );
      expect(out.stockMovementIds.length).toBe(1);
    });

    it("boş satırlar reddedilir (422 VET-CLINICAL_CONSUMPTION-0002)", async () => {
      await expect(
        service.create(
          TENANT_A,
          { context: "examination", contextRefId: "exam-3", lines: [] },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0002",
      });
    });

    it("geçersiz miktar (sıfır) reddedilir", async () => {
      const pid = await seedProduct("SKU-CC-5", "İlaç C");
      await expect(
        service.create(
          TENANT_A,
          {
            context: "examination",
            contextRefId: "exam-4",
            lines: [{ productId: pid, quantity: "0" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0002",
      });
    });

    it("service türünde ürün reddedilir (409 VET-CLINICAL_CONSUMPTION-0007)", async () => {
      const pid = await seedProduct("SKU-CC-6", "Hizmet A", {
        kind: "service",
      });
      await expect(
        service.create(
          TENANT_A,
          {
            context: "examination",
            contextRefId: "exam-5",
            lines: [{ productId: pid, quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0007",
      });
    });

    it("arşivli ürün reddedilir", async () => {
      const pid = await seedProduct("SKU-CC-7", "İlaç D");
      const p = await productsService.getProduct(TENANT_A, pid, VET_A);
      await productsService.archiveProduct(
        TENANT_A,
        p!.id,
        { reason: "test" },
        VET_A,
      );
      await expect(
        service.create(
          TENANT_A,
          {
            context: "examination",
            contextRefId: "exam-6",
            lines: [{ productId: pid, quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0007",
      });
    });

    it("ürün bulunamadı → 404 VET-CLINICAL_CONSUMPTION-0004", async () => {
      await expect(
        service.create(
          TENANT_A,
          {
            context: "examination",
            contextRefId: "exam-7",
            lines: [{ productId: "prd-yok", quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0004",
      });
    });

    it("cross-tenant create → tenant-A ürünü tenant-B'den görünmez (404)", async () => {
      const pid = await seedProduct("SKU-CC-8", "İlaç E");
      await expect(
        service.create(
          TENANT_B,
          {
            context: "examination",
            contextRefId: "exam-8",
            lines: [{ productId: pid, quantity: "1" }],
          },
          VET_B,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-CLINICAL_CONSUMPTION-0004" });
    });

    it("farklı tenant aktör ile aynı tenant ID üzerinden → 403 VET-AUTHZ-0001", async () => {
      const pid = await seedProduct("SKU-CC-8b", "İlaç E2");
      // VET_A (tenantA) ama tenantB üzerinden oluşturmaya çalışıyoruz.
      await expect(
        service.create(
          TENANT_B,
          {
            context: "examination",
            contextRefId: "exam-8b",
            lines: [{ productId: pid, quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });

    it("çok satırlı tüketim: her satır için ayrı stok hareketi", async () => {
      const pid1 = await seedProduct("SKU-CC-9", "İlaç F");
      const pid2 = await seedProduct("SKU-CC-10", "İlaç G");
      const out = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-9",
          lines: [
            { productId: pid1, quantity: "2" },
            { productId: pid2, quantity: "5" },
          ],
        },
        VET_A,
      );
      expect(out.stockMovementIds.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // recordForPrescription (idempotent)
  // -------------------------------------------------------------------------

  describe("recordForPrescription", () => {
    it("boş satır listesi → null (no-op)", async () => {
      const out = await service.recordForPrescription(
        TENANT_A,
        "prsc-1",
        "pat-1",
        [],
        VET_A,
      );
      expect(out).toBeNull();
    });

    it("aynı prescription için ikinci çağrıda mevcut kayıt döner (idempotent)", async () => {
      const pid = await seedProduct("SKU-CC-11", "İlaç H");
      const first = await service.recordForPrescription(
        TENANT_A,
        "prsc-2",
        "pat-2",
        [{ productId: pid, quantity: "1" }],
        VET_A,
      );
      const second = await service.recordForPrescription(
        TENANT_A,
        "prsc-2",
        "pat-2",
        [{ productId: pid, quantity: "1" }],
        VET_A,
      );
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second!.id).toBe(first!.id);
    });

    it("farklı prescription için yeni kayıt oluşturur", async () => {
      const pid = await seedProduct("SKU-CC-12", "İlaç I");
      const a = await service.recordForPrescription(
        TENANT_A,
        "prsc-3",
        null,
        [{ productId: pid, quantity: "1" }],
        VET_A,
      );
      const b = await service.recordForPrescription(
        TENANT_A,
        "prsc-4",
        null,
        [{ productId: pid, quantity: "1" }],
        VET_A,
      );
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.id).not.toBe(b!.id);
    });
  });

  // -------------------------------------------------------------------------
  // cancel (ters kayıt)
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("başarı: ters kayıt oluşturur + bakiyeyi geri getirir + audit", async () => {
      const pid = await seedProduct("SKU-CC-13", "İlaç J");
      const created = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-10",
          lines: [{ productId: pid, quantity: "4" }],
        },
        VET_A,
      );
      // İlk bakiye -4 olmalı.
      let balances = stockService.listBalances(TENANT_A, VET_A, {
        productId: pid,
      });
      expect(balances.items[0]?.netQuantity).toBe("-4");

      const cancelled = await service.cancel(
        TENANT_A,
        created.id,
        { cancelReason: "yanlış kayıt" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("yanlış kayıt");
      // İptal sonrası bakiye 0 olmalı (ters kayıt).
      balances = stockService.listBalances(TENANT_A, VET_A, {
        productId: pid,
      });
      expect(balances.items[0]?.netQuantity).toBe("0");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical_consumption.cancel",
        "clinical_consumption",
        created.id,
        "cancel",
        expect.anything(),
        "warning",
        expect.objectContaining({ cancelReason: "yanlış kayıt" }),
      );
    });

    it("iptal nedeni eksik → 422 VET-CLINICAL_CONSUMPTION-0005", async () => {
      const pid = await seedProduct("SKU-CC-14", "İlaç K");
      const created = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-11",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await expect(
        service.cancel(
          TENANT_A,
          created.id,
          { cancelReason: "" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0005",
      });
    });

    it("zaten iptal edilmiş → 409 VET-CLINICAL_CONSUMPTION-0006", async () => {
      const pid = await seedProduct("SKU-CC-15", "İlaç L");
      const created = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-12",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await service.cancel(
        TENANT_A,
        created.id,
        { cancelReason: "tekrar" },
        VET_A,
      );
      await expect(
        service.cancel(
          TENANT_A,
          created.id,
          { cancelReason: "tekrar-2" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0006",
      });
    });

    it("kayıt bulunamadı → 404 VET-CLINICAL_CONSUMPTION-0001", async () => {
      await expect(
        service.cancel(
          TENANT_A,
          "clco-yok",
          { cancelReason: "test" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0001",
      });
    });
  });

  // -------------------------------------------------------------------------
  // getById / list
  // -------------------------------------------------------------------------

  describe("getById", () => {
    it("tenant-scoped: aynı tenant erişim", async () => {
      const pid = await seedProduct("SKU-CC-16", "İlaç M");
      const created = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-13",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      const fetched = await service.getById(TENANT_A, created.id, VET_A);
      expect(fetched?.id).toBe(created.id);
    });

    it("cross-tenant erişim → null", async () => {
      const pid = await seedProduct("SKU-CC-17", "İlaç N");
      const created = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-14",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      const fetched = await service.getById(TENANT_B, created.id, VET_B);
      expect(fetched).toBeNull();
    });
  });

  describe("list", () => {
    it("context filtresi", async () => {
      const pid = await seedProduct("SKU-CC-18", "İlaç O");
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-15",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await service.create(
        TENANT_A,
        {
          context: "prescription",
          contextRefId: "prsc-5",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      const onlyExam = await service.list(
        TENANT_A,
        { context: "examination", limit: 50, offset: 0 },
        VET_A,
      );
      expect(onlyExam.items.length).toBe(1);
      expect(onlyExam.items[0]?.context).toBe("examination");
    });

    it("contextRefId filtresi", async () => {
      const pid = await seedProduct("SKU-CC-19", "İlaç P");
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-same",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-other",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      const filtered = await service.list(
        TENANT_A,
        { contextRefId: "exam-same", limit: 50, offset: 0 },
        VET_A,
      );
      expect(filtered.items.length).toBe(1);
    });

    it("status=cancelled filtresi", async () => {
      const pid = await seedProduct("SKU-CC-20", "İlaç Q");
      const c1 = await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-c-1",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-c-2",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      await service.cancel(
        TENANT_A,
        c1.id,
        { cancelReason: "iptal" },
        VET_A,
      );
      const cancelled = await service.list(
        TENANT_A,
        { status: "cancelled", limit: 50, offset: 0 },
        VET_A,
      );
      expect(cancelled.items.length).toBe(1);
      expect(cancelled.items[0]?.id).toBe(c1.id);
    });

    it("cross-tenant list → boş", async () => {
      const pid = await seedProduct("SKU-CC-21", "İlaç R");
      await service.create(
        TENANT_A,
        {
          context: "examination",
          contextRefId: "exam-ct",
          lines: [{ productId: pid, quantity: "1" }],
        },
        VET_A,
      );
      const list = await service.list(
        TENANT_B,
        { limit: 50, offset: 0 },
        VET_B,
      );
      expect(list.items.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-tenant: başka tenant'ın ürünü ile tüketim denemesi
  // -------------------------------------------------------------------------

  describe("cross-tenant data isolation", () => {
    it("başka tenant ürünü ile tüketim → 404", async () => {
      // Tenant B ürünü oluştur.
      const pidB = await seedProductForTenant(
        TENANT_B,
        "SKU-CC-22",
        "Tenant B Ürün",
        VET_B,
      );
      // Tenant A'dan bu ürünü kullanmaya çalış.
      await expect(
        service.create(
          TENANT_A,
          {
            context: "examination",
            contextRefId: "exam-ct-2",
            lines: [{ productId: pidB, quantity: "1" }],
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINICAL_CONSUMPTION-0004",
      });
    });
  });
});
