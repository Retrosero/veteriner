/**
 * @file PricingService unit testleri.
 * @module apps/api/modules/pricing/pricing.service.spec
 *
 * @description GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri
 *   service testleri.
 *   - Liste oluşturma (3 tür, customerId zorunluluğu, tarih aralığı).
 *   - Liste güncelleme (yalnızca draft, arşivli reddi, status kuralı).
 *   - Liste aktifleştirme (draft → active, satır yoksa 422, idempotent).
 *   - Liste arşivleme (soft delete, zaten arşivli 409).
 *   - Satır ekleme (unique kontrol, arşivli ürün 422, arşivli liste 409).
 *   - Satır amend (append-only, supersedesId zinciri, audit warning).
 *   - Satır iptal (idempotent, superseded iptal edilemez 409).
 *   - Resolver (tür önceliği, tarih filtresi, aday yoksa 404).
 *   - Cross-tenant tenant izolasyonu (403 VET-AUTHZ-0001).
 *   - Liste/satır bulunamadı (404 VET-PRICING-0001/0008).
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  PriceListCreateInput,
  PriceListItemCreateInput,
  ProductCreateInput,
} from "@vetniva/contracts";

import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";

import { PricingRepository } from "./pricing.repository.js";
import { PricingService } from "./pricing.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CUSTOMER_1 = "c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0";
const CUSTOMER_2 = "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1";

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
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
  correlationId: "req-2",
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
  correlationId: "req-3",
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

interface TestContext {
  service: PricingService;
  repo: PricingRepository;
  products: ProductsService;
  productsRepo: ProductsRepository;
  audit: AuditService;
}

function makeContext(): TestContext {
  const repo = new PricingRepository();
  const productsRepo = new ProductsRepository();
  const audit = makeAudit();
  const products = new ProductsService(productsRepo, audit);
  const service = new PricingService(repo, products, audit);
  return { service, repo, products, productsRepo, audit };
}

describe("PricingService", () => {
  let ctx: TestContext;
  let productId: string;

  beforeEach(async () => {
    ctx = makeContext();
    const p = await ctx.products.createProduct(
      TENANT_A,
      makeProductInput({ name: "Test Mamasi" }),
      OWNER_A,
    );
    productId = p.id;
  });

  // -------------------------------------------------------------------------
  // createPriceList
  // -------------------------------------------------------------------------

  describe("createPriceList", () => {
    it("standard liste oluşturur (status=draft, customerId=null)", async () => {
      const input: PriceListCreateInput = {
        name: "Standart Liste 2026",
        type: "standard",
        currency: "TRY",
      };
      const list = await ctx.service.createPriceList(
        TENANT_A,
        input,
        OWNER_A,
      );
      expect(list.id).toMatch(/^prl-/);
      expect(list.status).toBe("draft");
      expect(list.type).toBe("standard");
      expect(list.customerId).toBeNull();
      expect(list.itemCount).toBe(0);
      expect(list.archivedAt).toBeNull();
    });

    it("customer_specific için customerId zorunlu (VET-PRICING-0005)", async () => {
      const input = {
        name: "VIP Müşteri",
        type: "customer_specific" as const,
        currency: "TRY",
      } as PriceListCreateInput;
      await expect(
        ctx.service.createPriceList(TENANT_A, input, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("customerId yalnızca customer_specific için (VET-PRICING-0005)", async () => {
      const input = {
        name: "Standart Liste",
        type: "standard" as const,
        currency: "TRY",
        customerId: CUSTOMER_1,
      } as PriceListCreateInput;
      await expect(
        ctx.service.createPriceList(TENANT_A, input, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("customer_specific + customerId ile oluşturur", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        {
          name: "VIP Müşteri",
          type: "customer_specific",
          customerId: CUSTOMER_1,
          currency: "TRY",
        },
        OWNER_A,
      );
      expect(list.customerId).toBe(CUSTOMER_1);
      expect(list.type).toBe("customer_specific");
    });

    it("validFrom > validUntil reddi (VET-PRICING-0004)", async () => {
      const input: PriceListCreateInput = {
        name: "Tarih Hatalı",
        type: "standard",
        currency: "TRY",
        validFrom: "2026-12-31T00:00:00.000Z",
        validUntil: "2026-01-01T00:00:00.000Z",
      };
      await expect(
        ctx.service.createPriceList(TENANT_A, input, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("audit log create event üretir", async () => {
      await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste 1", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      expect(ctx.audit.recordSimple).toHaveBeenCalledWith(
        "audit:price_list.create",
        "price_list",
        expect.any(String),
        "create",
        expect.objectContaining({ actorId: "usr-owner-a" }),
        "info",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updatePriceList
  // -------------------------------------------------------------------------

  describe("updatePriceList", () => {
    it("yalnızca draft listede değişiklik kabul eder", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const updated = await ctx.service.updatePriceList(
        TENANT_A,
        list.id,
        { name: "Liste Yeni" },
        OWNER_A,
      );
      expect(updated.name).toBe("Liste Yeni");
    });

    it("aktif listede değişiklik reddi (VET-PRICING-0006)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      // Önce aktifleştir.
      await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A);
      // Şimdi güncelleme dene.
      await expect(
        ctx.service.updatePriceList(
          TENANT_A,
          list.id,
          { name: "X" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("arşivli listede güncelleme reddi (VET-PRICING-0007)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.archivePriceList(
        TENANT_A,
        list.id,
        { reason: "test" },
        OWNER_A,
      );
      await expect(
        ctx.service.updatePriceList(
          TENANT_A,
          list.id,
          { name: "X" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("olmayan liste (VET-PRICING-0001)", async () => {
      await expect(
        ctx.service.updatePriceList(
          TENANT_A,
          "11111111-1111-1111-1111-111111111111",
          { name: "X" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // activatePriceList
  // -------------------------------------------------------------------------

  describe("activatePriceList", () => {
    it("satırsız draft → 422 VET-PRICING-0010", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await expect(
        ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("draft + en az 1 satır → active", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      const activated = await ctx.service.activatePriceList(
        TENANT_A,
        list.id,
        OWNER_A,
      );
      expect(activated.status).toBe("active");
      expect(activated.itemCount).toBe(1);
    });

    it("zaten aktif ise idempotent (no-op)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A);
      const again = await ctx.service.activatePriceList(
        TENANT_A,
        list.id,
        OWNER_A,
      );
      expect(again.status).toBe("active");
    });
  });

  // -------------------------------------------------------------------------
  // archivePriceList
  // -------------------------------------------------------------------------

  describe("archivePriceList", () => {
    it("soft delete + status=archived", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const archived = await ctx.service.archivePriceList(
        TENANT_A,
        list.id,
        { reason: "eski liste" },
        OWNER_A,
      );
      expect(archived.status).toBe("archived");
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.archiveReason).toBe("eski liste");
    });

    it("zaten arşivli 409 VET-PRICING-0007", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.archivePriceList(
        TENANT_A,
        list.id,
        { reason: "r1" },
        OWNER_A,
      );
      await expect(
        ctx.service.archivePriceList(
          TENANT_A,
          list.id,
          { reason: "r2" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // addItem
  // -------------------------------------------------------------------------

  describe("addItem", () => {
    it("yeni satır ekler (status=active, supersedesId=null)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const item = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "15.50" },
        OWNER_A,
      );
      expect(item.status).toBe("active");
      expect(item.price).toBe("15.50");
      expect(item.supersedesId).toBeNull();
    });

    it("aynı ürün için ikinci aktif satır reddi (VET-PRICING-0003)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const input: PriceListItemCreateInput = {
        productId,
        price: "10",
      };
      await ctx.service.addItem(TENANT_A, list.id, input, OWNER_A);
      await expect(
        ctx.service.addItem(TENANT_A, list.id, input, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("arşivli ürün reddi (VET-PRICING-0009)", async () => {
      const p = await ctx.products.createProduct(
        TENANT_A,
        makeProductInput({ name: "Arşivlenecek" }),
        OWNER_A,
      );
      await ctx.products.archiveProduct(
        TENANT_A,
        p.id,
        { reason: "test" },
        OWNER_A,
      );
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await expect(
        ctx.service.addItem(
          TENANT_A,
          list.id,
          { productId: p.id, price: "10" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("arşivli listeye satır reddi (VET-PRICING-0007)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.archivePriceList(
        TENANT_A,
        list.id,
        { reason: "r" },
        OWNER_A,
      );
      await expect(
        ctx.service.addItem(
          TENANT_A,
          list.id,
          { productId, price: "10" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("geçersiz fiyat formatı (VET-PRICING-0010)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await expect(
        ctx.service.addItem(
          TENANT_A,
          list.id,
          { productId, price: "abc" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("olmayan ürün (VET-PRICING-0008)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await expect(
        ctx.service.addItem(
          TENANT_A,
          list.id,
          {
            productId: "99999999-9999-9999-9999-999999999999",
            price: "10",
          },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // updateItem (append-only)
  // -------------------------------------------------------------------------

  describe("updateItem (append-only)", () => {
    it("düzeltme yeni satır + eski superseded", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const orig = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      const amended = await ctx.service.updateItem(
        TENANT_A,
        list.id,
        orig.id,
        { price: "12.50" },
        OWNER_A,
      );
      expect(amended.id).not.toBe(orig.id);
      expect(amended.supersedesId).toBe(orig.id);
      expect(amended.status).toBe("active");
      expect(amended.price).toBe("12.50");

      // Eski satır kontrolü.
      const list2 = await ctx.service.listItems(
        TENANT_A,
        list.id,
        { limit: 10, offset: 0 },
        OWNER_A,
      );
      const old = list2.items.find((i) => i.id === orig.id);
      expect(old?.status).toBe("superseded");
    });

    it("aktif olmayan listede düzeltme reddi (VET-PRICING-0006)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const orig = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      // Aktifleştir.
      await ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A);
      // Şimdi düzeltme reddi.
      await expect(
        ctx.service.updateItem(
          TENANT_A,
          list.id,
          orig.id,
          { price: "12" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("superseded satırı düzeltme reddi (VET-PRICING-0007)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const orig = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.updateItem(
        TENANT_A,
        list.id,
        orig.id,
        { price: "12" },
        OWNER_A,
      );
      // Şimdi orig zaten superseded; ikinci kez düzeltme reddi.
      await expect(
        ctx.service.updateItem(
          TENANT_A,
          list.id,
          orig.id,
          { price: "13" },
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("audit warning event (amend)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const orig = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.updateItem(
        TENANT_A,
        list.id,
        orig.id,
        { price: "12" },
        OWNER_A,
      );
      expect(ctx.audit.recordSimple).toHaveBeenCalledWith(
        "audit:price_list_item.amend",
        "price_list_item",
        expect.any(String),
        "amend",
        expect.objectContaining({ actorId: "usr-owner-a" }),
        "warning",
        expect.objectContaining({ supersedesId: orig.id }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelItem
  // -------------------------------------------------------------------------

  describe("cancelItem", () => {
    it("iptal eder (status=active → cancelled)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const item = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      const cancelled = await ctx.service.cancelItem(
        TENANT_A,
        list.id,
        item.id,
        OWNER_A,
      );
      expect(cancelled.status).toBe("cancelled");
    });

    it("superseded iptal edilemez (VET-PRICING-0007)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const orig = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.updateItem(
        TENANT_A,
        list.id,
        orig.id,
        { price: "12" },
        OWNER_A,
      );
      await expect(
        ctx.service.cancelItem(TENANT_A, list.id, orig.id, OWNER_A),
      ).rejects.toThrow(DomainError);
    });

    it("zaten iptal edilmiş idempotent (no-op)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const item = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.cancelItem(TENANT_A, list.id, item.id, OWNER_A);
      const again = await ctx.service.cancelItem(
        TENANT_A,
        list.id,
        item.id,
        OWNER_A,
      );
      expect(again.status).toBe("cancelled");
    });
  });

  // -------------------------------------------------------------------------
  // resolveProductPrice
  // -------------------------------------------------------------------------

  describe("resolveProductPrice", () => {
    it("tür önceliği: customer_specific > promotional > standard", async () => {
      // 3 liste oluştur.
      const std = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Standart", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const promo = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Promosyon", type: "promotional", currency: "TRY" },
        OWNER_A,
      );
      const custom = await ctx.service.createPriceList(
        TENANT_A,
        {
          name: "VIP",
          type: "customer_specific",
          customerId: CUSTOMER_1,
          currency: "TRY",
        },
        OWNER_A,
      );

      // Her birine aynı ürün için satır ekle ve aktifleştir.
      for (const list of [std, promo, custom]) {
        await ctx.service.addItem(
          TENANT_A,
          list.id,
          { productId, price: "10" },
          OWNER_A,
        );
        await ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A);
      }

      const resolved = await ctx.service.resolveProductPrice(
        TENANT_A,
        productId,
        new Date("2026-07-31T00:00:00.000Z"),
        OWNER_A,
      );
      expect(resolved.candidates.length).toBe(3);
      expect(resolved.candidates[0]?.priceListType).toBe(
        "customer_specific",
      );
      expect(resolved.candidates[1]?.priceListType).toBe("promotional");
      expect(resolved.candidates[2]?.priceListType).toBe("standard");
    });

    it("aday yoksa 404 VET-PRICING-0011", async () => {
      await expect(
        ctx.service.resolveProductPrice(
          TENANT_A,
          productId,
          new Date("2026-07-31T00:00:00.000Z"),
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("iptal/edilmiş satır aday olmaz", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const item = await ctx.service.addItem(
        TENANT_A,
        list.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.activatePriceList(TENANT_A, list.id, OWNER_A);
      await ctx.service.cancelItem(
        TENANT_A,
        list.id,
        item.id,
        OWNER_A,
      );
      await expect(
        ctx.service.resolveProductPrice(
          TENANT_A,
          productId,
          new Date("2026-07-31T00:00:00.000Z"),
          OWNER_A,
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-tenant
  // -------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("başka tenant'ın actor.tenantId ile VET-AUTHZ-0001", async () => {
      await expect(
        ctx.service.createPriceList(
          TENANT_A,
          { name: "Liste", type: "standard", currency: "TRY" },
          STAFF_B,
        ),
      ).rejects.toThrow(DomainError);
    });

    it("SUPERADMIN bypass (cross-tenant okuma)", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Liste", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const got = await ctx.service.getPriceList(
        TENANT_A,
        list.id,
        SUPERADMIN,
      );
      expect(got?.id).toBe(list.id);
    });
  });

  // -------------------------------------------------------------------------
  // Listeleme
  // -------------------------------------------------------------------------

  describe("listPriceLists", () => {
    it("type/status filtreleri çalışır", async () => {
      await ctx.service.createPriceList(
        TENANT_A,
        { name: "S1", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      const p1 = await ctx.service.createPriceList(
        TENANT_A,
        { name: "P1", type: "promotional", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.addItem(
        TENANT_A,
        p1.id,
        { productId, price: "10" },
        OWNER_A,
      );
      await ctx.service.activatePriceList(TENANT_A, p1.id, OWNER_A);

      const drafts = await ctx.service.listPriceLists(
        TENANT_A,
        { status: "draft", limit: 10, offset: 0 },
        OWNER_A,
      );
      expect(drafts.items.every((i) => i.status === "draft")).toBe(true);

      const promos = await ctx.service.listPriceLists(
        TENANT_A,
        { type: "promotional", limit: 10, offset: 0 },
        OWNER_A,
      );
      expect(promos.items.every((i) => i.type === "promotional")).toBe(
        true,
      );
    });

    it("arşivliler default görünmez", async () => {
      const list = await ctx.service.createPriceList(
        TENANT_A,
        { name: "Arşiv", type: "standard", currency: "TRY" },
        OWNER_A,
      );
      await ctx.service.archivePriceList(
        TENANT_A,
        list.id,
        { reason: "x" },
        OWNER_A,
      );
      const all = await ctx.service.listPriceLists(
        TENANT_A,
        { limit: 10, offset: 0 },
        OWNER_A,
      );
      expect(all.items.find((i) => i.id === list.id)).toBeUndefined();
      const archived = await ctx.service.listPriceLists(
        TENANT_A,
        { status: "archived", limit: 10, offset: 0 },
        OWNER_A,
      );
      expect(archived.items.find((i) => i.id === list.id)).toBeDefined();
    });
  });
});
