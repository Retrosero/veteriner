/**
 * @file ReportsService unit testleri.
 * @module apps/api/modules/reports/reports.service.spec
 *
 * @description GOAL-076 temel finans raporları service testleri.
 *   - getDailySalesReport (clinic + petshop toplamı).
 *   - exportReport (audit üretir; CSV/JSON format).
 *   - Cross-tenant read 403.
 *
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsService } from "./reports.service.js";
import { ClinicSalesRepository } from "../clinic-sales/clinic-sales.repository.js";
import { ClinicSalesService } from "../clinic-sales/clinic-sales.service.js";
import { PetshopSalesRepository } from "../petshop-sales/petshop-sales.repository.js";
import { PetshopSalesService } from "../petshop-sales/petshop-sales.service.js";
import { ProductsRepository } from "../products/products.repository.js";
import { ProductsService } from "../products/products.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  Payment,
  PaymentFilters,
  PaymentListResponse,
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

/** Stub PaymentsService — sadece listPayments davranışı. */
class StubPaymentsService {
  public listHandler: (
    tenantId: string,
    filters: PaymentFilters,
  ) => Promise<PaymentListResponse> = async () => ({
    items: [],
    total: 0,
  });

  public async listPayments(
    tenantId: string,
    filters: PaymentFilters,
  ): Promise<PaymentListResponse> {
    return this.listHandler(tenantId, filters);
  }
}

describe("ReportsService", () => {
  let service: ReportsService;
  let clinicSales: ClinicSalesService;
  let petshopSales: PetshopSalesService;
  let productsService: ProductsService;
  let payments: StubPaymentsService;
  let audit: AuditService;

  beforeEach(() => {
    audit = makeAudit();
    const productRepo = new ProductsRepository();
    productsService = new ProductsService(productRepo, audit);
    clinicSales = new ClinicSalesService(
      new ClinicSalesRepository(),
      productsService,
      audit,
    );
    petshopSales = new PetshopSalesService(
      new PetshopSalesRepository(),
      productsService,
      // PetshopSalesService StockMovementsService'e bağımlı; biz
      // burada kullanmıyoruz, stub geçiyoruz.
      {} as never,
      audit,
    );
    payments = new StubPaymentsService();
    service = new ReportsService(
      clinicSales,
      petshopSales,
      payments as unknown as never,
      audit,
    );
  });

  // ---------------------------------------------------------------------------
  // getDailySalesReport
  // ---------------------------------------------------------------------------

  describe("getDailySalesReport", () => {
    it("boş tenant için sıfır toplamlar", async () => {
      const out = await service.getDailySalesReport(
        TENANT_A,
        { from: "2026-07-31", to: "2026-07-31" },
        STAFF_A,
      );
      expect(out.clinicSalesTotal).toBe("0");
      expect(out.petshopSalesTotal).toBe("0");
      expect(out.combinedTotal).toBe("0");
      expect(out.clinicSaleCount).toBe(0);
      expect(out.petshopSaleCount).toBe(0);
    });

    it("klinik satış completed ise dahil edilir", async () => {
      const p = await productsService.createProduct(
        TENANT_A,
        {
          kind: "service",
          name: "Test Hizmet",
          unit: "unit",
          taxProfile: "standard",
          currency: "TRY",
          clinicUsage: true,
          petshopUsage: false,
          saleAvailable: true,
          purchaseTracked: false,
          requiresPrescription: false,
          controlledDrug: false,
          salePrice: "100",
        },
        STAFF_A,
      );
      const created = await clinicSales.createClinicSale(
        TENANT_A,
        {
          customerOwnerId: "00000000-0000-0000-0000-000000000001",
          customerPatientId: "00000000-0000-0000-0000-000000000002",
          sourceType: "examination",
          sourceId: "exam-001",
          currency: "TRY",
          globalDiscountPercent: 0,
          lines: [{ productId: p.id, unit: "unit", quantity: "1" }],
        },
        STAFF_A,
      );
      await clinicSales.completeClinicSale(TENANT_A, created.sale.id, STAFF_A);
      const today = new Date().toISOString().slice(0, 10);
      const out = await service.getDailySalesReport(
        TENANT_A,
        { from: today, to: today },
        STAFF_A,
      );
      expect(out.clinicSalesTotal).toBe("100");
      expect(out.clinicSaleCount).toBe(1);
      expect(out.petshopSalesTotal).toBe("0");
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentMethodsReport
  // ---------------------------------------------------------------------------

  describe("getPaymentMethodsReport", () => {
    it("yöntem bazlı kırılım", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const fakePayments: Payment[] = [
        {
          id: "pm-1",
          tenantId: TENANT_A,
          sourceType: "clinic_sale",
          sourceId: "s-1",
          amount: "100",
          method: "cash",
          currency: "TRY",
          paidAt: `${today}T10:00:00.000Z`,
          idempotencyKey: null,
          reference: null,
          notes: null,
          status: "completed",
          reversedAmount: "0",
          effectiveAmount: "100",
          reversedAt: null,
          reversedBy: null,
          reverseReason: null,
          createdAt: `${today}T10:00:00.000Z`,
          createdBy: "u",
        },
        {
          id: "pm-2",
          tenantId: TENANT_A,
          sourceType: "petshop_sale",
          sourceId: "s-2",
          amount: "200",
          method: "card",
          currency: "TRY",
          paidAt: `${today}T11:00:00.000Z`,
          idempotencyKey: null,
          reference: null,
          notes: null,
          status: "completed",
          reversedAmount: "0",
          effectiveAmount: "200",
          reversedAt: null,
          reversedBy: null,
          reverseReason: null,
          createdAt: `${today}T11:00:00.000Z`,
          createdBy: "u",
        },
      ];
      payments.listHandler = async () => ({
        items: fakePayments,
        total: 2,
      });
      const out = await service.getPaymentMethodsReport(
        TENANT_A,
        { from: today, to: today },
        STAFF_A,
      );
      expect(out.totalCount).toBe(2);
      expect(out.totalAmount).toBe("300");
      const cash = out.breakdown.find((b) => b.method === "cash");
      const card = out.breakdown.find((b) => b.method === "card");
      expect(cash?.count).toBe(1);
      expect(cash?.totalAmount).toBe("100");
      expect(card?.count).toBe(1);
      expect(card?.totalAmount).toBe("200");
    });

    it("reversed payment dahil edilmez", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const reversed: Payment = {
        id: "pm-3",
        tenantId: TENANT_A,
        sourceType: "clinic_sale",
        sourceId: "s-3",
        amount: "500",
        method: "cash",
        currency: "TRY",
        paidAt: `${today}T10:00:00.000Z`,
        idempotencyKey: null,
        reference: null,
        notes: null,
        status: "reversed",
        reversedAmount: "500",
        effectiveAmount: "0",
        reversedAt: `${today}T11:00:00.000Z`,
        reversedBy: "u",
        reverseReason: "iptal",
        createdAt: `${today}T10:00:00.000Z`,
        createdBy: "u",
      };
      payments.listHandler = async () => ({
        items: [reversed],
        total: 1,
      });
      const out = await service.getPaymentMethodsReport(
        TENANT_A,
        { from: today, to: today },
        STAFF_A,
      );
      expect(out.totalCount).toBe(0);
      expect(out.totalAmount).toBe("0");
    });
  });

  // ---------------------------------------------------------------------------
  // getOpenBalancesReport
  // ---------------------------------------------------------------------------

  describe("getOpenBalancesReport", () => {
    it("ödenmemiş klinik satışlar listelenir", async () => {
      const p = await productsService.createProduct(
        TENANT_A,
        {
          kind: "service",
          name: "Muayene",
          unit: "unit",
          taxProfile: "standard",
          currency: "TRY",
          clinicUsage: true,
          petshopUsage: false,
          saleAvailable: true,
          purchaseTracked: false,
          requiresPrescription: false,
          controlledDrug: false,
          salePrice: "200",
        },
        STAFF_A,
      );
      const created = await clinicSales.createClinicSale(
        TENANT_A,
        {
          customerOwnerId: "00000000-0000-0000-0000-000000000001",
          customerPatientId: "00000000-0000-0000-0000-000000000002",
          sourceType: "examination",
          sourceId: "exam-open",
          currency: "TRY",
          globalDiscountPercent: 0,
          lines: [{ productId: p.id, unit: "unit", quantity: "1" }],
        },
        STAFF_A,
      );
      await clinicSales.completeClinicSale(TENANT_A, created.sale.id, STAFF_A);
      // Stub payments → hiç ödeme yok.
      payments.listHandler = async () => ({ items: [], total: 0 });
      const out = await service.getOpenBalancesReport(TENANT_A, STAFF_A);
      expect(out.openItemCount).toBe(1);
      expect(out.totalOpenAmount).toBe("200");
      expect(out.items[0]?.openAmount).toBe("200");
    });
  });

  // ---------------------------------------------------------------------------
  // exportReport
  // ---------------------------------------------------------------------------

  describe("exportReport", () => {
    it("export audit üretir", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const out = await service.exportReport(
        TENANT_A,
        {
          type: "daily_sales",
          dateRange: { from: today, to: today },
          format: "json",
        },
        STAFF_A,
      );
      expect(out.type).toBe("daily_sales");
      expect(out.format).toBe("json");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:report.export",
        "report",
        expect.stringContaining("export-daily_sales-"),
        "export",
        expect.anything(),
        "info",
        expect.objectContaining({ type: "daily_sales" }),
      );
    });

    it("CSV formatında başlık satırı içerir", async () => {
      payments.listHandler = async () => ({ items: [], total: 0 });
      const out = await service.exportReport(
        TENANT_A,
        {
          type: "open_balances",
          format: "csv",
        },
        STAFF_A,
      );
      expect(out.format).toBe("csv");
      expect(out.content).toContain("sourceType,sourceId");
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant read 403 VET-AUTHZ-0001", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await expect(
        service.getDailySalesReport(
          TENANT_B,
          { from: today, to: today },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
