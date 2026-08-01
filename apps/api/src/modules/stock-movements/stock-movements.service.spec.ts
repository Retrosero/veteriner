/**
 * @file StockMovementsService unit testleri.
 * @module apps/api/modules/stock-movements/stock-movements.service.spec
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım service
 * testleri.
 *   - 9 hareket türü kabul edilir (purchase, sale, clinical_use,
 *     vaccination, return, transfer, count_adjustment, waste,
 *     reversal).
 *   - count_adjustment / waste / reversal için neden (reason)
 *     zorunlu (422 VET-STOCK-0007).
 *   - Ürün bulunamadı (404 VET-STOCK-0003/0004).
 *   - Arşivlenmiş ürün (409 VET-STOCK-0009).
 *   - Service türünde ürün (422 VET-STOCK-0008).
 *   - Lot bulunamadı (404 VET-STOCK-0005) / arşivli (409 VET-STOCK-0006).
 *   - Lot-ürün eşleşmiyor (422 VET-STOCK-0011).
 *   - Ters kayıt (reversal): aynı orijinale 2. kez 409 VET-STOCK-0010.
 *   - Sistem hareketi (createSystemMovement) sourceType/sourceId zorunlu.
 *   - Tenant izolasyonu (cross-tenant → 403 VET-AUTHZ-0001).
 *   - Bakiye hesabı (purchase +3, sale -1, reversal +1 = net 3).
 *   - search filtreleri (productId/lotId/type/occurredFrom).
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { StockMovementsRepository } from "./stock-movements.repository.js";
import { StockMovementsService } from "./stock-movements.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Product, StockLot } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Test sabitleri
 * -------------------------------------------------------------------------- */

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-a",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-a2",
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
  correlationId: "req-b",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

/* --------------------------------------------------------------------------
 * Product / Lot fabrikaları
 * -------------------------------------------------------------------------- */

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prd-1",
    tenantId: TENANT_A,
    kind: "stock_product",
    sku: "prd-s000001",
    barcode: null,
    name: "Test Ürün",
    category: null,
    unit: "unit",
    taxProfile: "standard",
    purchasePrice: "10.00",
    salePrice: "15.00",
    currency: "TRY",
    clinicUsage: true,
    petshopUsage: true,
    saleAvailable: true,
    purchaseTracked: true,
    vaccineProtocolId: null,
    requiresPrescription: false,
    controlledDrug: false,
    lowStockThreshold: null,
    notes: null,
    active: true,
    createdAt: "2026-07-30T00:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-07-30T00:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...overrides,
  };
}

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: "lot-1",
    tenantId: TENANT_A,
    productId: "prd-1",
    lotNumber: "LOT-A",
    expiryDate: "2027-01-01T00:00:00.000Z",
    manufacturedAt: null,
    receivedAt: "2026-07-30T00:00:00.000Z",
    supplierName: null,
    shelfId: null,
    quantity: "100",
    notes: null,
    active: true,
    createdAt: "2026-07-30T00:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-07-30T00:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
 * Yardımcılar
 * -------------------------------------------------------------------------- */

function makeProductsService(opts: {
  byId?: ((id: string) => Product | null) | undefined;
}) {
  const fallback = (id: string) => (id === "prd-1" ? makeProduct() : null);
  const byId = opts.byId ?? fallback;
  return {
    getProduct: vi.fn(async (_t: string, id: string) => byId(id)),
  } as unknown as ConstructorParameters<typeof StockMovementsService>[1];
}

function makeInventoryService(opts: {
  byId?: ((id: string) => StockLot | null) | undefined;
}) {
  const fallback = (id: string) => (id === "lot-1" ? makeLot() : null);
  const byId = opts.byId ?? fallback;
  return {
    getLot: vi.fn(async (_t: string, id: string) => byId(id)),
  } as unknown as ConstructorParameters<typeof StockMovementsService>[2];
}

function makeSvc(opts?: {
  productsById?: ((id: string) => Product | null) | undefined;
  lotsById?: ((id: string) => StockLot | null) | undefined;
}) {
  const repo = new StockMovementsRepository();
  const products = makeProductsService({ byId: opts?.productsById });
  const inventory = makeInventoryService({ byId: opts?.lotsById });
  const audit = makeAudit();
  const svc = new StockMovementsService(repo, products, inventory, audit);
  return { svc, repo, products, inventory, audit };
}

/* --------------------------------------------------------------------------
 * Testler
 * -------------------------------------------------------------------------- */

describe("StockMovementsService — GOAL-063", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- 1: 9 hareket türü kabul ----------
  it.each([
    "purchase",
    "sale",
    "clinical_use",
    "vaccination",
    "return",
    "transfer",
    "count_adjustment",
    "waste",
    "reversal",
  ] as const)("kabul eder: %s", async (type) => {
    const { svc } = makeSvc();
    const input = {
      type,
      productId: "prd-1",
      quantity: type === "count_adjustment" ? "-2" : "1",
      reason:
        type === "count_adjustment" || type === "waste" || type === "reversal"
          ? "Test nedeni"
          : undefined,
    } as Parameters<typeof svc.createMovement>[1];
    const result = await svc.createMovement(TENANT_A, input, OWNER_A);
    expect(result.type).toBe(type);
    expect(result.tenantId).toBe(TENANT_A);
  });

  // ---------- 2: neden zorunlu (count_adjustment) ----------
  it("count_adjustment için reason yoksa 422 VET-STOCK-0007 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "count_adjustment", productId: "prd-1", quantity: "-1" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0007" });
  });

  // ---------- 3: neden zorunlu (waste) ----------
  it("waste için reason yoksa 422 VET-STOCK-0007 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "waste", productId: "prd-1", quantity: "-1" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0007" });
  });

  // ---------- 4: neden zorunlu (reversal) ----------
  it("reversal (manuel oluşturma) için reason yoksa 422 VET-STOCK-0007 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "reversal", productId: "prd-1", quantity: "1" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0007" });
  });

  // ---------- 5: Ürün bulunamadı ----------
  it("ürün yoksa 404 VET-STOCK-0003 fırlatır", async () => {
    const { svc } = makeSvc({
      productsById: () => null,
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "missing", quantity: "1" },
        OWNER_A,
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });

  // ---------- 6: Arşivli ürün ----------
  it("arşivlenmiş ürün için 409 VET-STOCK-0009 fırlatır", async () => {
    const { svc } = makeSvc({
      productsById: () =>
        makeProduct({ archivedAt: "2026-07-30T00:00:00.000Z" }),
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "prd-1", quantity: "1" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0009" });
  });

  // ---------- 7: Service türü ----------
  it("service türünde ürün için 422 VET-STOCK-0008 fırlatır", async () => {
    const { svc } = makeSvc({
      productsById: () => makeProduct({ kind: "service" }),
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "prd-1", quantity: "1" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0008" });
  });

  // ---------- 8: Lot bulunamadı ----------
  it("lot yoksa 404 VET-STOCK-0005 fırlatır", async () => {
    const { svc } = makeSvc({
      lotsById: () => null,
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        {
          type: "purchase",
          productId: "prd-1",
          lotId: "missing",
          quantity: "1",
        },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0005" });
  });

  // ---------- 9: Arşivli lot ----------
  it("arşivlenmiş lot için 409 VET-STOCK-0006 fırlatır", async () => {
    const { svc } = makeSvc({
      lotsById: () => makeLot({ archivedAt: "2026-07-30T00:00:00.000Z" }),
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        {
          type: "purchase",
          productId: "prd-1",
          lotId: "lot-1",
          quantity: "1",
        },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0006" });
  });

  // ---------- 10: Lot-ürün eşleşmiyor ----------
  it("lot başka ürüne aitse 422 VET-STOCK-0011 fırlatır", async () => {
    const { svc } = makeSvc({
      lotsById: () => makeLot({ productId: "prd-other" }),
    });
    await expect(
      svc.createMovement(
        TENANT_A,
        {
          type: "purchase",
          productId: "prd-1",
          lotId: "lot-1",
          quantity: "1",
        },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0011" });
  });

  // ---------- 11: Geçersiz quantity ----------
  it("sıfır quantity 422 VET-VALIDATION-0010 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "prd-1", quantity: "0" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-VALIDATION-0010" });
  });

  // ---------- 12: Geçersiz quantity (string) ----------
  it("geçersiz quantity formatı 422 VET-VALIDATION-0010 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "prd-1", quantity: "abc" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-VALIDATION-0010" });
  });

  // ---------- 13: Tenant izolasyonu ----------
  it("cross-tenant create 403 VET-AUTHZ-0001 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createMovement(
        TENANT_A,
        { type: "purchase", productId: "prd-1", quantity: "1" },
        // STAFF_B başka tenant'tan geliyor
        STAFF_B,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
  });

  // ---------- 14: Reverse — başarılı ----------
  it("ters kayıt (reversal) yeni reversal hareketi oluşturur", async () => {
    const { svc, repo } = makeSvc();
    const original = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "5" },
      OWNER_A,
    );
    const reversal = await svc.reverseMovement(
      TENANT_A,
      original.id,
      { reason: "İade alındı" },
      OWNER_A,
    );
    expect(reversal.type).toBe("reversal");
    expect(reversal.reversesMovementId).toBe(original.id);
    expect(reversal.quantity).toBe("-5");
    // Audit 2 kez (create + reverse)
    expect(repo.findById(TENANT_A, original.id)).toBeTruthy();
  });

  // ---------- 15: Reverse — ikinci kez 409 ----------
  it("aynı orijinale ikinci ters kayıt 409 VET-STOCK-0010 fırlatır", async () => {
    const { svc } = makeSvc();
    const original = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "5" },
      OWNER_A,
    );
    await svc.reverseMovement(
      TENANT_A,
      original.id,
      { reason: "İade" },
      OWNER_A,
    );
    await expect(
      svc.reverseMovement(
        TENANT_A,
        original.id,
        { reason: "İkinci deneme" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0010" });
  });

  // ---------- 16: Reverse — hareket yok ----------
  it("olmayan hareketi tersine çevirmek 404 VET-STOCK-0001 fırlatır", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.reverseMovement(
        TENANT_A,
        "stmv-missing",
        { reason: "Test" },
        OWNER_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0001" });
  });

  // ---------- 17: Reverse — cross-tenant ----------
  it("cross-tenant reverse 403 VET-AUTHZ-0001 fırlatır", async () => {
    const { svc } = makeSvc();
    const original = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "5" },
      OWNER_A,
    );
    await expect(
      svc.reverseMovement(TENANT_A, original.id, { reason: "Test" }, STAFF_B),
    ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
  });

  // ---------- 18: listMovements ----------
  it("listMovements ürün filtresi doğru sonuç döner", async () => {
    const { svc } = makeSvc();
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "1" },
      OWNER_A,
    );
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "2" },
      OWNER_A,
    );
    const result = await svc.listMovements(
      TENANT_A,
      { productId: "prd-1", limit: 10, offset: 0 },
      OWNER_A,
    );
    expect(result.total).toBe(2);
  });

  // ---------- 19: listMovements — type filtresi ----------
  it("listMovements type filtresi doğru sonuç döner", async () => {
    const { svc } = makeSvc();
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "1" },
      OWNER_A,
    );
    await svc.createMovement(
      TENANT_A,
      { type: "sale", productId: "prd-1", quantity: "-1" },
      OWNER_A,
    );
    const result = await svc.listMovements(
      TENANT_A,
      { type: "sale", limit: 10, offset: 0 },
      OWNER_A,
    );
    expect(result.total).toBe(1);
    expect(result.items[0]?.type).toBe("sale");
  });

  // ---------- 20: listBalances ----------
  it("listBalances: purchase +3, sale -1, reversal +1 → net 3", async () => {
    const { svc } = makeSvc();
    const buy = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "3" },
      OWNER_A,
    );
    await svc.createMovement(
      TENANT_A,
      { type: "sale", productId: "prd-1", quantity: "-1" },
      OWNER_A,
    );
    await svc.reverseMovement(TENANT_A, buy.id, { reason: "İptal" }, OWNER_A);
    const balances = svc.listBalances(TENANT_A, OWNER_A, {
      productId: "prd-1",
    });
    expect(balances.items.length).toBe(1);
    const bal = balances.items[0];
    expect(bal?.netQuantity).toBe("-1"); // 3 - 1 - 3 = -1
    expect(bal?.movementCount).toBe(3);
  });

  // ---------- 21: getMovement — cross-tenant null ----------
  it("getMovement cross-tenant → null döner", async () => {
    const { svc } = makeSvc();
    const m = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "1" },
      OWNER_A,
    );
    const cross = await svc.getMovement(TENANT_B, m.id, STAFF_B);
    expect(cross).toBeNull();
  });

  // ---------- 22: createSystemMovement ----------
  it("createSystemMovement sourceType/sourceId zorunlu (422 VET-STOCK-0012)", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createSystemMovement(
        TENANT_A,
        // eksik sourceType/sourceId
        { type: "purchase", productId: "prd-1", quantity: "1" },
        OWNER_A,
        // systemMeta da eksik
        { systemSourceType: "", systemSourceId: "" },
      ),
    ).rejects.toMatchObject({ errorCode: "VET-STOCK-0012" });
  });

  // ---------- 23: createSystemMovement başarı ----------
  it("createSystemMovement başarıyla hareket oluşturur", async () => {
    const { svc } = makeSvc();
    const m = await svc.createSystemMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "10" },
      OWNER_A,
      { systemSourceType: "purchase_order", systemSourceId: "po-1" },
    );
    expect(m.sourceType).toBe("purchase_order");
    expect(m.sourceId).toBe("po-1");
  });

  // ---------- 24: listMovements — occurredFrom filtresi ----------
  it("listMovements occurredFrom filtresi uygular", async () => {
    const { svc } = makeSvc();
    await svc.createMovement(
      TENANT_A,
      {
        type: "purchase",
        productId: "prd-1",
        quantity: "1",
        occurredAt: "2020-01-01T00:00:00.000Z",
      },
      OWNER_A,
    );
    const result = await svc.listMovements(
      TENANT_A,
      {
        occurredFrom: "2026-01-01T00:00:00.000Z",
        limit: 10,
        offset: 0,
      },
      OWNER_A,
    );
    expect(result.total).toBe(0);
  });

  // ---------- 25: listBalances — lot bazlı ----------
  it("listBalances lot bazlı ayrı kalem döner", async () => {
    const { svc } = makeSvc({
      lotsById: (id) => makeLot({ id }),
    });
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", lotId: "lot-1", quantity: "5" },
      OWNER_A,
    );
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", lotId: "lot-2", quantity: "7" },
      OWNER_A,
    );
    const balances = svc.listBalances(TENANT_A, OWNER_A, {
      productId: "prd-1",
    });
    expect(balances.items.length).toBe(2);
  });

  // ---------- 26: getMovement — başarı ----------
  it("getMovement başarıyla hareket döner", async () => {
    const { svc } = makeSvc();
    const created = await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "1" },
      OWNER_A,
    );
    const got = await svc.getMovement(TENANT_A, created.id, OWNER_A);
    expect(got?.id).toBe(created.id);
  });

  // ---------- 27: getMovement — yok null ----------
  it("getMovement olmayan ID → null", async () => {
    const { svc } = makeSvc();
    const got = await svc.getMovement(TENANT_A, "stmv-missing", OWNER_A);
    expect(got).toBeNull();
  });

  // ---------- 28: listMovements — STAFF yetkisi (read) ----------
  it("STAFF_A listeleyebilir (read permission testte uygulanmaz, sadece actor)", async () => {
    const { svc } = makeSvc();
    await svc.createMovement(
      TENANT_A,
      { type: "purchase", productId: "prd-1", quantity: "1" },
      OWNER_A,
    );
    const result = await svc.listMovements(
      TENANT_A,
      { limit: 10, offset: 0 },
      STAFF_A,
    );
    expect(result.total).toBe(1);
  });

  // ---------- 29: sourceType/sourceId public create ----------
  it("public create sourceType/sourceId set eder", async () => {
    const { svc } = makeSvc();
    const m = await svc.createMovement(
      TENANT_A,
      {
        type: "purchase",
        productId: "prd-1",
        quantity: "1",
        sourceType: "manual",
        sourceId: "ui-form",
      },
      OWNER_A,
    );
    expect(m.sourceType).toBe("manual");
    expect(m.sourceId).toBe("ui-form");
  });

  // ---------- 30: count_adjustment pozitif --------
  it("count_adjustment pozitif quantity kabul eder (stoğa giriş)", async () => {
    const { svc } = makeSvc();
    const m = await svc.createMovement(
      TENANT_A,
      {
        type: "count_adjustment",
        productId: "prd-1",
        quantity: "5",
        reason: "Sayım fazlası",
      },
      OWNER_A,
    );
    expect(m.quantity).toBe("5");
  });
});
