/**
 * @file PurchaseOrdersService unit testleri.
 * @module apps/api/modules/purchase-orders/purchase-orders.service.spec
 *
 * @description GOAL-062 satın alma siparişi service testleri.
 *   - Taslak oluşturma (toplam hesabı + audit + supplier aktif kontrolü).
 *   - Onay (draft → approved).
 *   - Mal kabul (approved → partial | received; orderedQuantity aşımı
 *     422).
 *   - İptal (draft/approved → cancelled; partial/received iptal
 *     edilemez 409).
 *   - Listeleme / detay (tenant-scoped; cross-tenant IDOR → null).
 *   - Tenant izolasyonu (cross-tenant → 403 VET-AUTHZ-0001).
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import { PurchaseOrdersService } from "./purchase-orders.service.js";
import { PurchaseOrdersRepository } from "./purchase-orders.repository.js";
import { SuppliersService } from "../suppliers/suppliers.service.js";
import { SuppliersRepository } from "../suppliers/suppliers.repository.js";
import type {
  PurchaseOrderCancelInput,
  PurchaseOrderCreateInput,
  PurchaseOrderReceiveInput,
  PurchaseOrderUpdateInput,
} from "@vetniva/contracts";
import type {
  SupplierCreateInput,
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

function makeCreateInput(
  overrides: Partial<SupplierCreateInput> = {},
): SupplierCreateInput {
  return {
    name: "Test Tedarikçi",
    code: `T-${Math.random().toString(36).slice(2, 8)}`,
    type: "general",
    ...overrides,
  };
}

function makePoInput(
  supplierId: string,
  overrides: Partial<PurchaseOrderCreateInput> = {},
): PurchaseOrderCreateInput {
  return {
    supplierId,
    currency: "TRY",
    lines: [
      {
        productId: "prd-x-001",
        unit: "unit",
        orderedQuantity: "10",
        unitPrice: "25.50",
      },
    ],
    ...overrides,
  };
}

describe("PurchaseOrdersService", () => {
  let service: PurchaseOrdersService;
  let poRepo: PurchaseOrdersRepository;
  let supRepo: SuppliersRepository;
  let suppliers: SuppliersService;
  let audit: AuditService;

  beforeEach(() => {
    poRepo = new PurchaseOrdersRepository();
    supRepo = new SuppliersRepository();
    audit = makeAudit();
    suppliers = new SuppliersService(supRepo, audit);
    service = new PurchaseOrdersService(poRepo, suppliers, audit);
  });

  async function seedSupplier(
    code: string = "SUP-A-001",
    name: string = "Supplier A",
  ): Promise<string> {
    const s = await suppliers.createSupplier(
      TENANT_A,
      makeCreateInput({ code, name }),
      STAFF_A,
    );
    return s.id;
  }

  // ---------------------------------------------------------------------------
  // createPurchaseOrder
  // ---------------------------------------------------------------------------

  describe("createPurchaseOrder", () => {
    it("taslak sipariş oluşturur + totalAmount hesaplanır + audit", async () => {
      const supplierId = await seedSupplier();
      const out = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(supplierId, {
          lines: [
            { productId: "p1", unit: "unit", orderedQuantity: "10", unitPrice: "25.50" },
            { productId: "p2", unit: "unit", orderedQuantity: "5", unitPrice: "100" },
          ],
        }),
        STAFF_A,
      );
      expect(out.order.id).toMatch(/^po-/);
      expect(out.order.status).toBe("draft");
      expect(out.order.totalAmount).toBe("755"); // 255 + 500, ondalık sıfırlar normalize edilir
      expect(out.lines.length).toBe(2);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:purchase_order.create",
        "purchase_order",
        out.order.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ lineCount: 2 }),
      );
    });

    it("tedarikçi arşivliyse 422 VET-PURCHASE_ORDER-0005", async () => {
      const supplierId = await seedSupplier("SUP-ARCH", "Archived Sup");
      await suppliers.archiveSupplier(
        TENANT_A,
        supplierId,
        { reason: "test" },
        STAFF_A,
      );
      await expect(
        service.createPurchaseOrder(
          TENANT_A,
          makePoInput(supplierId),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0005",
        httpStatus: 422,
      });
    });

    it("tedarikçi yoksa 422 VET-PURCHASE_ORDER-0005", async () => {
      await expect(
        service.createPurchaseOrder(
          TENANT_A,
          makePoInput("00000000-0000-0000-0000-000000000000"),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0005",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listPurchaseOrders
  // ---------------------------------------------------------------------------

  describe("listPurchaseOrders", () => {
    it("tenant-scoped; başka tenant'ın siparişleri dönmez", async () => {
      const supA = await seedSupplier("SUP-A-X", "Sup A");
      const supB = await seedSupplier(); // tenant B'de değil; aynı tenant'ta farklı kod
      const codeB = "SUP-B-001";
      const supBTenantB = (await suppliers.createSupplier(
        TENANT_B,
        makeCreateInput({ code: codeB, name: "Sup B" }),
        STAFF_B,
      )).id;
      await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(supA),
        STAFF_A,
      );
      await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(supB),
        STAFF_A,
      );
      await service.createPurchaseOrder(
        TENANT_B,
        makePoInput(supBTenantB),
        STAFF_B,
      );
      const list = await service.listPurchaseOrders(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(2);
    });

    it("status filtresi çalışır", async () => {
      const sup = await seedSupplier("SUP-SF", "Sup SF");
      const a = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      await service.approvePurchaseOrder(TENANT_A, a.order.id, STAFF_A);
      await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup, {
          supplierId: sup,
          lines: [
            { productId: "px", unit: "unit", orderedQuantity: "3", unitPrice: "10" },
          ],
        }),
        STAFF_A,
      );
      const approved = await service.listPurchaseOrders(
        TENANT_A,
        { status: "approved", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(approved.total).toBe(1);
      expect(approved.items[0]?.status).toBe("approved");
    });
  });

  // ---------------------------------------------------------------------------
  // getPurchaseOrderDetail
  // ---------------------------------------------------------------------------

  describe("getPurchaseOrderDetail", () => {
    it("header + lines döner", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      const detail = await service.getPurchaseOrderDetail(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      expect(detail?.order.id).toBe(created.order.id);
      expect(detail?.lines.length).toBe(1);
    });

    it("cross-tenant IDOR → null", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      const detail = await service.getPurchaseOrderDetail(
        TENANT_B,
        created.order.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updatePurchaseOrder
  // ---------------------------------------------------------------------------

  describe("updatePurchaseOrder", () => {
    it("draft siparişte notes günceller", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      const updated = await service.updatePurchaseOrder(
        TENANT_A,
        created.order.id,
        { notes: "güncellendi" } as PurchaseOrderUpdateInput,
        STAFF_A,
      );
      expect(updated.order.notes).toBe("güncellendi");
    });

    it("onaylı siparişte güncelleme 409 VET-PURCHASE_ORDER-0004", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      await expect(
        service.updatePurchaseOrder(
          TENANT_A,
          created.order.id,
          { notes: "x" } as PurchaseOrderUpdateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0004",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // approvePurchaseOrder
  // ---------------------------------------------------------------------------

  describe("approvePurchaseOrder", () => {
    it("draft → approved + approvedAt set", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      const approved = await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      expect(approved.order.status).toBe("approved");
      expect(approved.order.approvedAt).not.toBeNull();
      expect(approved.order.approvedBy).toBe("usr-staff-a");
    });

    it("approved sipariş tekrar onaylanamaz 409 VET-PURCHASE_ORDER-0002", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      await expect(
        service.approvePurchaseOrder(
          TENANT_A,
          created.order.id,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // receivePurchaseOrder
  // ---------------------------------------------------------------------------

  describe("receivePurchaseOrder", () => {
    it("tam kabul → received", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup, {
          lines: [
            {
              productId: "p1",
              unit: "unit",
              orderedQuantity: "10",
              unitPrice: "20",
            },
          ],
        }),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      const lineId = created.lines[0]!.id;
      const received = await service.receivePurchaseOrder(
        TENANT_A,
        created.order.id,
        {
          lines: [
            {
              lineId,
              receivedQuantity: "10",
              unitCost: "19.50",
            },
          ],
        } as PurchaseOrderReceiveInput,
        STAFF_A,
      );
      expect(received.order.status).toBe("received");
      expect(received.lines[0]?.receivedQuantity).toBe("10");
      expect(received.lines[0]?.unitCost).toBe("19.50");
      expect(received.order.receivedAt).not.toBeNull();
    });

    it("kısmi kabul → partial", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup, {
          lines: [
            {
              productId: "p1",
              unit: "unit",
              orderedQuantity: "10",
              unitPrice: "20",
            },
          ],
        }),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      const lineId = created.lines[0]!.id;
      const received = await service.receivePurchaseOrder(
        TENANT_A,
        created.order.id,
        {
          lines: [
            { lineId, receivedQuantity: "5", unitCost: "20" },
          ],
        } as PurchaseOrderReceiveInput,
        STAFF_A,
      );
      expect(received.order.status).toBe("partial");
    });

    it("kabul miktarı orderedQuantity'yi aşamaz 422", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup, {
          lines: [
            {
              productId: "p1",
              unit: "unit",
              orderedQuantity: "10",
              unitPrice: "20",
            },
          ],
        }),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      const lineId = created.lines[0]!.id;
      await expect(
        service.receivePurchaseOrder(
          TENANT_A,
          created.order.id,
          {
            lines: [
              { lineId, receivedQuantity: "15", unitCost: "20" },
            ],
          } as PurchaseOrderReceiveInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0007",
        httpStatus: 422,
      });
    });

    it("draft sipariş kabul edilemez 409 VET-PURCHASE_ORDER-0002", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      await expect(
        service.receivePurchaseOrder(
          TENANT_A,
          created.order.id,
          {
            lines: [
              {
                lineId: created.lines[0]!.id,
                receivedQuantity: "1",
                unitCost: "10",
              },
            ],
          } as PurchaseOrderReceiveInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelPurchaseOrder
  // ---------------------------------------------------------------------------

  describe("cancelPurchaseOrder", () => {
    it("draft → cancelled + cancelReason set", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        STAFF_A,
      );
      const cancelled = await service.cancelPurchaseOrder(
        TENANT_A,
        created.order.id,
        { reason: "yanlışlık" } as PurchaseOrderCancelInput,
        STAFF_A,
      );
      expect(cancelled.order.status).toBe("cancelled");
      expect(cancelled.order.cancelReason).toBe("yanlışlık");
    });

    it("received sipariş iptal edilemez 409 VET-PURCHASE_ORDER-0008", async () => {
      const sup = await seedSupplier();
      const created = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup, {
          lines: [
            { productId: "p", unit: "unit", orderedQuantity: "1", unitPrice: "10" },
          ],
        }),
        STAFF_A,
      );
      await service.approvePurchaseOrder(
        TENANT_A,
        created.order.id,
        STAFF_A,
      );
      await service.receivePurchaseOrder(
        TENANT_A,
        created.order.id,
        {
          lines: [
            {
              lineId: created.lines[0]!.id,
              receivedQuantity: "1",
              unitCost: "10",
            },
          ],
        } as PurchaseOrderReceiveInput,
        STAFF_A,
      );
      await expect(
        service.cancelPurchaseOrder(
          TENANT_A,
          created.order.id,
          { reason: "x" } as PurchaseOrderCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PURCHASE_ORDER-0008",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const sup = await seedSupplier();
      await expect(
        service.createPurchaseOrder(
          TENANT_B,
          makePoInput(sup),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("SUPERADMIN tüm tenant'lara erişir", async () => {
      const sup = await seedSupplier("SUP-SUPER", "Sup S");
      const out = await service.createPurchaseOrder(
        TENANT_A,
        makePoInput(sup),
        SUPERADMIN,
      );
      expect(out.order.id).toMatch(/^po-/);
    });

    it("DomainError tipinde hata fırlatır", async () => {
      const sup = await seedSupplier();
      await expect(
        service.createPurchaseOrder(
          TENANT_A,
          makePoInput("00000000-0000-0000-0000-000000000000"),
          STAFF_A,
        ),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });
});
