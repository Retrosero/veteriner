/**
 * @file InventoryService unit testleri.
 * @module apps/api/modules/inventory/inventory.service.spec
 *
 * @description GOAL-061 depo, raf, lot ve SKT service testleri.
 *   - Warehouse create/list/get/update/archive: code unique, arşiv
 *     bağımlılık engeli (aktif raf), arşivli güncelleme engeli.
 *   - Shelf create/list/get/update/archive: warehouseId mevcudiyet,
 *     code depo-içi unique, arşivli depoda raf oluşturulamaz,
 *     aktif lot varsa arşivlenemez.
 *   - StockLot create/list/get/update/archive: SKT geçmiş kontrolü,
 *     lot numarası productId bazında unique, shelfId mevcudiyet,
 *     arşivli kayıt güncelleme engeli.
 *   - Tenant izolasyonu (cross-tenant → 403 VET-AUTHZ-0001).
 *   - Cross-tenant IDOR → findById/findBySku null.
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { InventoryService } from "./inventory.service.js";
import { InventoryRepository } from "./inventory.repository.js";
import type {
  ShelfCreateInput,
  ShelfUpdateInput,
  StockLotCreateInput,
  StockLotUpdateInput,
  WarehouseCreateInput,
  WarehouseUpdateInput,
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

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
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

function makeWarehouseInput(
  overrides: Partial<WarehouseCreateInput> = {},
): WarehouseCreateInput {
  return {
    name: "Ana Depo",
    code: "MAIN",
    type: "general",
    ...overrides,
  };
}

function makeShelfInput(
  overrides: Partial<ShelfCreateInput> = {},
): ShelfCreateInput {
  return {
    warehouseId: "wh-tnt-aaaa--000001",
    name: "Soğuk Oda / Raf A",
    code: "COLD-A",
    temperatureZone: "cold",
    ...overrides,
  };
}

function futureIso(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString();
}

function pastIso(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function makeLotInput(
  overrides: Partial<StockLotCreateInput> = {},
): StockLotCreateInput {
  return {
    productId: "prd-tnt-aaaa--000001",
    lotNumber: "LOT-2026-001",
    expiryDate: futureIso(180),
    supplierName: "Acme Pharma",
    quantity: "100",
    ...overrides,
  };
}

describe("InventoryService", () => {
  let service: InventoryService;
  let repo: InventoryRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new InventoryRepository();
    audit = makeAudit();
    service = new InventoryService(repo, audit);
  });

  // -------------------------------------------------------------------------
  // Warehouse
  // -------------------------------------------------------------------------

  describe("Warehouse — başarı", () => {
    it("create — general depo oluşturur, audit info yayar", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ name: "Ana Depo", code: "MAIN" }),
        STAFF_A,
      );
      expect(w.id).toMatch(/^wh-/);
      expect(w.tenantId).toBe(TENANT_A);
      expect(w.name).toBe("Ana Depo");
      expect(w.code).toBe("MAIN");
      expect(w.type).toBe("general");
      expect(w.active).toBe(true);
      expect(w.archivedAt).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:inventory.warehouse.create",
        "warehouse",
        w.id,
        "create",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.any(Object),
      );
    });

    it("create — clinic türünde depo oluşturulabilir", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ name: "Klinik Depo", code: "CLINIC", type: "clinic" }),
        STAFF_A,
      );
      expect(w.type).toBe("clinic");
    });

    it("list — arşivlenmişler dönmez, code'a göre sıralanır", async () => {
      await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ name: "Z Depo", code: "Z-DEPO" }),
        STAFF_A,
      );
      await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ name: "A Depo", code: "A-DEPO" }),
        STAFF_A,
      );
      const r = await service.listWarehouses(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(2);
      expect(r.items[0]?.code).toBe("A-DEPO");
      expect(r.items[1]?.code).toBe("Z-DEPO");
    });

    it("get — ID ile döner", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const r = await service.getWarehouse(TENANT_A, w.id, STAFF_A);
      expect(r?.id).toBe(w.id);
    });

    it("update — name + code günceller, code değişirse unique kontrolü", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const upd: WarehouseUpdateInput = { name: "Ana Depo Yenilendi", code: "MAIN-NEW" };
      const r = await service.updateWarehouse(TENANT_A, w.id, upd, STAFF_A);
      expect(r.name).toBe("Ana Depo Yenilendi");
      expect(r.code).toBe("MAIN-NEW");
    });
  });

  describe("Warehouse — negatif", () => {
    it("create — duplicate code → 409 VET-INV-0004", async () => {
      await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      await expect(
        service.createWarehouse(
          TENANT_A,
          makeWarehouseInput({ code: "MAIN" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0004" });
    });

    it("update — arşivli → 409 VET-INV-0008", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      await service.archiveWarehouse(
        TENANT_A,
        w.id,
        { reason: "test" },
        STAFF_A,
      );
      await expect(
        service.updateWarehouse(
          TENANT_A,
          w.id,
          { name: "x" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0008" });
    });

    it("archive — aktif raf varsa → 409 VET-INV-0010", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      await expect(
        service.archiveWarehouse(
          TENANT_A,
          w.id,
          { reason: "test" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0010" });
    });

    it("archive — zaten arşivli → 409 VET-INV-0007", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        OWNER_A,
      );
      await service.archiveWarehouse(
        TENANT_A,
        w.id,
        { reason: "test" },
        OWNER_A,
      );
      await expect(
        service.archiveWarehouse(
          TENANT_A,
          w.id,
          { reason: "test2" },
          OWNER_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0007" });
    });

    it("cross-tenant create → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createWarehouse(
          TENANT_B,
          makeWarehouseInput({ code: "MAIN" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });

    it("cross-tenant IDOR → getWarehouse null", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const r = await service.getWarehouse(TENANT_B, w.id, STAFF_B);
      expect(r).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Shelf
  // -------------------------------------------------------------------------

  describe("Shelf — başarı", () => {
    it("create — depo altına raf ekler, code depo-içi unique", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const s = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      expect(s.id).toMatch(/^shf-/);
      expect(s.warehouseId).toBe(w.id);
      expect(s.temperatureZone).toBe("cold");
      expect(s.code).toBe("A");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:inventory.shelf.create",
        "shelf",
        s.id,
        "create",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.any(Object),
      );
    });

    it("list — warehouseId filtresi", async () => {
      const w1 = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "WH1" }),
        STAFF_A,
      );
      const w2 = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "WH2" }),
        STAFF_A,
      );
      await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w1.id, code: "A", name: "A1" }),
        STAFF_A,
      );
      await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w2.id, code: "A", name: "A2" }),
        STAFF_A,
      );
      const r = await service.listShelves(
        TENANT_A,
        { warehouseId: w1.id, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.warehouseId).toBe(w1.id);
    });

    it("update — temperatureZone değiştirilebilir", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const s = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      const upd: ShelfUpdateInput = { temperatureZone: "freezer" };
      const r = await service.updateShelf(TENANT_A, s.id, upd, STAFF_A);
      expect(r.temperatureZone).toBe("freezer");
    });
  });

  describe("Shelf — negatif", () => {
    it("create — warehouse yok → 404 VET-INV-0001", async () => {
      await expect(
        service.createShelf(
          TENANT_A,
          makeShelfInput({ warehouseId: "wh-tnt-aaaa--999999" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0001" });
    });

    it("create — arşivli depoda → 409 VET-INV-0008", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        OWNER_A,
      );
      await service.archiveWarehouse(
        TENANT_A,
        w.id,
        { reason: "test" },
        OWNER_A,
      );
      await expect(
        service.createShelf(
          TENANT_A,
          makeShelfInput({ warehouseId: w.id, code: "A" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0008" });
    });

    it("create — duplicate code → 409 VET-INV-0005", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      await expect(
        service.createShelf(
          TENANT_A,
          makeShelfInput({ warehouseId: w.id, code: "A" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0005" });
    });

    it("archive — aktif lot varsa → 409 VET-INV-0010", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        OWNER_A,
      );
      const s = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      await service.createLot(
        TENANT_A,
        makeLotInput({ shelfId: s.id }),
        STAFF_A,
      );
      await expect(
        service.archiveShelf(
          TENANT_A,
          s.id,
          { reason: "test" },
          OWNER_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0010" });
    });
  });

  // -------------------------------------------------------------------------
  // StockLot
  // -------------------------------------------------------------------------

  describe("StockLot — başarı", () => {
    it("create — geçerli SKT ile lot oluşturur", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const s = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      const l = await service.createLot(
        TENANT_A,
        makeLotInput({
          shelfId: s.id,
          lotNumber: "LOT-A",
          expiryDate: futureIso(120),
        }),
        STAFF_A,
      );
      expect(l.id).toMatch(/^lot-/);
      expect(l.lotNumber).toBe("LOT-A");
      expect(l.shelfId).toBe(s.id);
      expect(l.quantity).toBe("100");
      expect(l.active).toBe(true);
    });

    it("list — productId filtresi", async () => {
      await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-1", lotNumber: "L1" }),
        STAFF_A,
      );
      await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-2", lotNumber: "L2" }),
        STAFF_A,
      );
      const r = await service.listLots(
        TENANT_A,
        { productId: "prd-1", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.productId).toBe("prd-1");
    });

    it("list — expiredOnly=true yalnızca geçmiş SKT'li lotları döner", async () => {
      // createLot geçmiş SKT'yi reddeder (VET-INV-0009). Bu nedenle
      // repo üzerinden doğrudan expired kayıt enjekte edip service'in
      // expiredOnly filtresini test ediyoruz.
      const nowIso = new Date().toISOString();
      repo.insertLot({
        id: repo.nextLotId(TENANT_A),
        tenantId: TENANT_A,
        productId: "prd-1",
        lotNumber: "PAST",
        expiryDate: pastIso(1),
        manufacturedAt: null,
        receivedAt: nowIso,
        supplierName: null,
        shelfId: null,
        quantity: null,
        notes: null,
        active: true,
        createdAt: nowIso,
        createdBy: "system",
        updatedAt: nowIso,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      });
      await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-1", lotNumber: "FUTURE", expiryDate: futureIso(120) }),
        STAFF_A,
      );
      const r = await service.listLots(
        TENANT_A,
        { expiredOnly: true, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.lotNumber).toBe("PAST");
    });

    it("update — shelfId değiştirilebilir, supplierName nullable", async () => {
      const w = await service.createWarehouse(
        TENANT_A,
        makeWarehouseInput({ code: "MAIN" }),
        STAFF_A,
      );
      const s1 = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "A" }),
        STAFF_A,
      );
      const s2 = await service.createShelf(
        TENANT_A,
        makeShelfInput({ warehouseId: w.id, code: "B" }),
        STAFF_A,
      );
      const l = await service.createLot(
        TENANT_A,
        makeLotInput({ shelfId: s1.id, lotNumber: "LOT-MOVE" }),
        STAFF_A,
      );
      const upd: StockLotUpdateInput = { shelfId: s2.id, supplierName: null };
      const r = await service.updateLot(TENANT_A, l.id, upd, STAFF_A);
      expect(r.shelfId).toBe(s2.id);
      expect(r.supplierName).toBeNull();
    });
  });

  describe("StockLot — negatif", () => {
    it("create — geçmiş SKT → 422 VET-INV-0009", async () => {
      await expect(
        service.createLot(
          TENANT_A,
          makeLotInput({ expiryDate: pastIso(10) }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0009" });
    });

    it("create — duplicate lot number (productId bazında) → 409 VET-INV-0006", async () => {
      await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-1", lotNumber: "LOT-A" }),
        STAFF_A,
      );
      await expect(
        service.createLot(
          TENANT_A,
          makeLotInput({ productId: "prd-1", lotNumber: "LOT-A" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0006" });
    });

    it("create — aynı lot number farklı productId için kabul edilir", async () => {
      await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-1", lotNumber: "LOT-A" }),
        STAFF_A,
      );
      const l2 = await service.createLot(
        TENANT_A,
        makeLotInput({ productId: "prd-2", lotNumber: "LOT-A" }),
        STAFF_A,
      );
      expect(l2.productId).toBe("prd-2");
    });

    it("create — shelfId mevcut değil → 404 VET-INV-0002", async () => {
      await expect(
        service.createLot(
          TENANT_A,
          makeLotInput({ shelfId: "shf-tnt-aaaa--999999" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0002" });
    });

    it("update — arşivli lot → 409 VET-INV-0008", async () => {
      const l = await service.createLot(
        TENANT_A,
        makeLotInput({ lotNumber: "LOT-1" }),
        STAFF_A,
      );
      await service.archiveLot(TENANT_A, l.id, { reason: "test" }, STAFF_A);
      await expect(
        service.updateLot(
          TENANT_A,
          l.id,
          { notes: "x" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0008" });
    });

    it("update — SKT geçmişe çevrilemez → 422 VET-INV-0009", async () => {
      const l = await service.createLot(
        TENANT_A,
        makeLotInput({ lotNumber: "LOT-1" }),
        STAFF_A,
      );
      await expect(
        service.updateLot(
          TENANT_A,
          l.id,
          { expiryDate: pastIso(1) },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-INV-0009" });
    });

    it("cross-tenant create → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createLot(
          TENANT_B,
          makeLotInput({ lotNumber: "LOT-1" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });
  });
});
