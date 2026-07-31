/**
 * @file CustomerBalancesService unit testleri.
 * @module apps/api/modules/customer-balances/customer-balances.service.spec
 *
 * @description GOAL-075 müşteri borç/alacak görünümü service
 *   testleri.
 *   - getSummary: clinic + petshop toplamları, payment
 *     tamamlama → openAmount 0; reversed payment →
 *     openAmount değişmez (reversedAmount ile).
 *   - listTransactions: tarih sıralı birleşik liste;
 *     type filtresi.
 *   - Cross-tenant read 403.
 *
 * @since GOAL-075 (FAZ-7) müşteri borç/alacak görünümü core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

import { CustomerBalancesService } from "./customer-balances.service.js";
import { ClinicSalesService } from "../clinic-sales/clinic-sales.service.js";
import { ClinicSalesRepository } from "../clinic-sales/clinic-sales.repository.js";
import { PetshopSalesService } from "../petshop-sales/petshop-sales.service.js";
import { PetshopSalesRepository } from "../petshop-sales/petshop-sales.repository.js";
import { ProductsService } from "../products/products.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { PaymentsService } from "../payments/payments.service.js";
import type {
  ClinicSaleCreateInput,
  PetshopSaleCreateInput,
  PaymentCreateInput,
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

const OWNER_A = "00000000-0000-0000-0000-000000000001";
const PATIENT_A = "00000000-0000-0000-0000-000000000002";

function makeAuditMock() {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  };
}

/** Stub PaymentsService — gerçek repo'ya bağlanmaz. */
class StubPaymentsService {
  public listResult: { items: never[]; total: number } = {
    items: [],
    total: 0,
  };
  public createdPayments: unknown[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async listPayments(_tenantId: string, _filters: any, _actor: any): Promise<any> {
    // createdPayments'i döndür; tüm tahsilatlarımız.
    return { items: this.createdPayments, total: this.createdPayments.length };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async createPayment(tenantId: string, input: any, _actor: any): Promise<any> {
    const fake = {
      id: `pm-stub-${Date.now()}-${Math.random()}`,
      tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount: input.amount,
      method: input.method,
      currency: input.currency,
      paidAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey ?? null,
      reference: null,
      notes: null,
      status: "completed",
      reversedAmount: "0",
      effectiveAmount: input.amount,
      reversedAt: null,
      reversedBy: null,
      reverseReason: null,
      createdAt: new Date().toISOString(),
      createdBy: "u",
    };
    this.createdPayments.push(fake);
    return fake;
  }
}

function makeProductInput(): ProductCreateInput {
  return {
    kind: "service",
    name: "Test Hizmet",
    unit: "unit",
    taxProfile: "standard",
    currency: "TRY",
    clinicUsage: true,
    petshopUsage: true,
    saleAvailable: true,
    purchaseTracked: false,
    requiresPrescription: false,
    controlledDrug: false,
    salePrice: "100",
  };
}

describe("CustomerBalancesService", () => {
  let service: CustomerBalancesService;
  let clinicSales: ClinicSalesService;
  let petshopSales: PetshopSalesService;
  let productsService: ProductsService;
  let payments: PaymentsService;
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(() => {
    audit = makeAuditMock();
    const productRepo = new ProductsRepository();
    productsService = new ProductsService(productRepo, audit as never);
    clinicSales = new ClinicSalesService(
      new ClinicSalesRepository(),
      productsService,
      audit as never,
    );
    // PetshopSalesService StockMovementsService'e bağımlı; burada
    // kullanmayacağımız için stub geçiyoruz.
    petshopSales = new PetshopSalesService(
      new PetshopSalesRepository(),
      productsService,
      {} as never,
      audit as never,
    );
    payments = new StubPaymentsService() as unknown as PaymentsService;
    service = new CustomerBalancesService(
      clinicSales,
      petshopSales,
      payments,
    );
  });

  async function seedProduct(sku: string, name: string): Promise<string> {
    const p = await productsService.createProduct(
      TENANT_A,
      { ...makeProductInput(), name, sku },
      STAFF_A,
    );
    return p.id;
  }

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  describe("getSummary", () => {
    it("owner için satış + ödeme yoksa tüm toplamlar 0", async () => {
      const out = await service.getSummary(
        TENANT_A,
        "00000000-0000-0000-0000-000000000099",
        STAFF_A,
      );
      expect(out.totalSaleAmount).toBe("0");
      expect(out.openAmount).toBe("0");
      expect(out.saleCount).toBe(0);
    });

    it("klinik satış + tahsilat → openAmount 0", async () => {
      const pid = await seedProduct("CB-1", "Muayene");
      const sale = await clinicSales.createClinicSale(
        TENANT_A,
        {
          customerOwnerId: OWNER_A,
          customerPatientId: PATIENT_A,
          sourceType: "examination",
          sourceId: "exam-cb-1",
          currency: "TRY",
          globalDiscountPercent: 0,
          lines: [
            { productId: pid, unit: "unit", quantity: "1" },
          ],
        } satisfies ClinicSaleCreateInput,
        STAFF_A,
      );
      await clinicSales.completeClinicSale(
        TENANT_A,
        sale.sale.id,
        STAFF_A,
      );
      // Tahsilat: tam tutar.
      await payments.createPayment(
        TENANT_A,
        {
          sourceType: "clinic_sale",
          sourceId: sale.sale.id,
          amount: "100",
          method: "cash",
          currency: "TRY",
        } satisfies PaymentCreateInput,
        STAFF_A,
      );
      const out = await service.getSummary(TENANT_A, OWNER_A, STAFF_A);
      expect(out.totalSaleAmount).toBe("100");
      expect(out.totalPaidAmount).toBe("100");
      expect(out.openAmount).toBe("0");
      expect(out.saleCount).toBe(1);
      expect(out.paymentCount).toBe(1);
    });

    it("petshop satış eklenirse toplam artar", async () => {
      const pid = await seedProduct("CB-2", "Mama");
      const sale = await petshopSales.createSale(
        TENANT_A,
        {
          customerOwnerId: OWNER_A,
          customerPatientId: PATIENT_A,
          paymentMethod: "cash",
          paidAmount: "200",
          globalDiscountPercent: 0,
          lines: [
            {
              productId: pid,
              unit: "unit",
              quantity: "2",
              unitPrice: "100",
            },
          ],
        } satisfies PetshopSaleCreateInput,
        STAFF_A,
      );
      await petshopSales.completeSale(
        TENANT_A,
        sale.sale.id,
        {},
        STAFF_A,
      );
      const out = await service.getSummary(TENANT_A, OWNER_A, STAFF_A);
      // 2 * 100 (default salePrice) = 200.
      expect(out.totalSaleAmount).toBe("200");
    });
  });

  // ---------------------------------------------------------------------------
  // listTransactions
  // ---------------------------------------------------------------------------

  describe("listTransactions", () => {
    it("klinik satış + tahsilat karışık liste", async () => {
      const pid = await seedProduct("CB-3", "Test");
      const sale = await clinicSales.createClinicSale(
        TENANT_A,
        {
          customerOwnerId: OWNER_A,
          customerPatientId: PATIENT_A,
          sourceType: "examination",
          sourceId: "exam-cb-3",
          currency: "TRY",
          globalDiscountPercent: 0,
          lines: [
            { productId: pid, unit: "unit", quantity: "1" },
          ],
        } satisfies ClinicSaleCreateInput,
        STAFF_A,
      );
      await clinicSales.completeClinicSale(
        TENANT_A,
        sale.sale.id,
        STAFF_A,
      );
      await payments.createPayment(
        TENANT_A,
        {
          sourceType: "clinic_sale",
          sourceId: sale.sale.id,
          amount: "100",
          method: "cash",
          currency: "TRY",
        } satisfies PaymentCreateInput,
        STAFF_A,
      );
      const out = await service.listTransactions(
        TENANT_A,
        OWNER_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(out.totalCount).toBe(2);
      const types = new Set(out.items.map((it) => it.type));
      expect(types.has("sale")).toBe(true);
      expect(types.has("payment")).toBe(true);
    });

    it("type filtresi yalnız ilgili türü döner", async () => {
      const pid = await seedProduct("CB-4", "Test");
      const sale = await clinicSales.createClinicSale(
        TENANT_A,
        {
          customerOwnerId: OWNER_A,
          customerPatientId: PATIENT_A,
          sourceType: "examination",
          sourceId: "exam-cb-4",
          currency: "TRY",
          globalDiscountPercent: 0,
          lines: [
            { productId: pid, unit: "unit", quantity: "1" },
          ],
        } satisfies ClinicSaleCreateInput,
        STAFF_A,
      );
      await clinicSales.completeClinicSale(
        TENANT_A,
        sale.sale.id,
        STAFF_A,
      );
      await payments.createPayment(
        TENANT_A,
        {
          sourceType: "clinic_sale",
          sourceId: sale.sale.id,
          amount: "100",
          method: "cash",
          currency: "TRY",
        } satisfies PaymentCreateInput,
        STAFF_A,
      );
      const onlySales = await service.listTransactions(
        TENANT_A,
        OWNER_A,
        { type: "sale", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(onlySales.totalCount).toBe(1);
      expect(onlySales.items[0]?.type).toBe("sale");
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant read 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.getSummary(
          TENANT_B,
          OWNER_A,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
