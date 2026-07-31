/**
 * @file CustomerBalances (müşteri borç/alacak görünümü) service.
 * @module apps/api/modules/customer-balances/customer-balances.service
 *
 * @description GOAL-075 (FAZ-7) müşteri borç/alacak görünümü iş
 * kuralları. Owner (sahip) bazında:
 * - Toplam satış tutarı, toplam tahsilat, toplam ters kayıt,
 *   net tutar, açık bakiye.
 * - Satış + tahsilat işlem geçmişi (karışık liste).
 *
 * Cross-module read-only:
 * - ClinicSalesService (clinic_sale)
 * - PetshopSalesService (petshop_sale)
 * - PaymentsService (payment)
 *
 * İş kuralları:
 * - `getSummary`: tüm satış + tahsilatları topla; net =
 *   totalPaid - totalReversed (reversed etkin tutarı 0).
 *   openAmount = totalNetAmount - totalPaidAmount.
 * - `listTransactions`: tarih sıralı birleşik liste.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-075 (FAZ-7) müşteri borç/alacak görünümü core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  CustomerBalanceSummary,
  CustomerTransaction,
  CustomerTransactionsFilters,
  CustomerTransactionsResponse,
} from "@vetniva/contracts";

import { ClinicSalesService } from "../clinic-sales/clinic-sales.service.js";
import { PetshopSalesService } from "../petshop-sales/petshop-sales.service.js";
import { PaymentsService } from "../payments/payments.service.js";

@Injectable()
export class CustomerBalancesService {
  private readonly logger = new Logger(CustomerBalancesService.name);

  public constructor(
    private readonly clinicSales: ClinicSalesService,
    private readonly petshopSales: PetshopSalesService,
    private readonly payments: PaymentsService,
  ) {}

  // -------------------------------------------------------------------------
  // getSummary
  // -------------------------------------------------------------------------

  public async getSummary(
    tenantId: string,
    ownerId: string,
    actor: ActorContext,
  ): Promise<CustomerBalanceSummary> {
    this.requireTenantScope(actor, tenantId);

    const [clinic, petshop, payments] = await Promise.all([
      this.clinicSales.listClinicSales(
        tenantId,
        {
          customerOwnerId: ownerId,
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
      this.petshopSales.listSales(
        tenantId,
        {
          customerOwnerId: ownerId,
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
      this.payments.listPayments(
        tenantId,
        { limit: 10000, offset: 0 },
        actor,
      ),
    ]);

    let totalSaleAmount = "0";
    let totalNetAmount = "0";
    let saleCount = 0;
    let lastSaleAt: string | null = null;

    for (const sale of clinic.items) {
      if (sale.status === "cancelled") continue;
      saleCount += 1;
      totalSaleAmount = addDecimal(totalSaleAmount, sale.netAmount);
      totalNetAmount = addDecimal(totalNetAmount, sale.netAmount);
      lastSaleAt = maxIso(lastSaleAt, sale.completedAt ?? sale.createdAt);
    }
    for (const sale of petshop.items) {
      if (sale.status === "cancelled") continue;
      saleCount += 1;
      totalSaleAmount = addDecimal(totalSaleAmount, sale.netAmount);
      totalNetAmount = addDecimal(totalNetAmount, sale.netAmount);
      lastSaleAt = maxIso(lastSaleAt, sale.completedAt ?? sale.createdAt);
    }

    // Tahsilatlar: bu owner'ın satışlarına bağlı olanlar.
    const saleIdSet = new Set<string>([
      ...clinic.items.map((s) => s.id),
      ...petshop.items.map((s) => s.id),
    ]);
    let totalPaidAmount = "0";
    let totalReversedAmount = "0";
    let paymentCount = 0;
    let lastPaymentAt: string | null = null;
    for (const p of payments.items) {
      if (!saleIdSet.has(p.sourceId)) continue;
      paymentCount += 1;
      lastPaymentAt = maxIso(lastPaymentAt, p.paidAt);
      // completed + partially_reversed durumlarında net (kalan)
      // tutarı effectiveAmount'tan alırız. status='reversed' ise
      // effectiveAmount=0 olduğu için hiç katkı sağlamaz.
      if (p.status === "completed" || p.status === "partially_reversed") {
        totalPaidAmount = addDecimal(totalPaidAmount, p.effectiveAmount);
        totalReversedAmount = addDecimal(
          totalReversedAmount,
          p.reversedAmount,
        );
      }
    }

    const openAmount = subDecimal(totalNetAmount, totalPaidAmount);

    return {
      ownerId,
      totalSaleAmount,
      totalPaidAmount,
      totalReversedAmount,
      totalNetAmount,
      openAmount,
      saleCount,
      paymentCount,
      lastSaleAt,
      lastPaymentAt,
    };
  }

  // -------------------------------------------------------------------------
  // listTransactions
  // -------------------------------------------------------------------------

  public async listTransactions(
    tenantId: string,
    ownerId: string,
    filters: CustomerTransactionsFilters,
    actor: ActorContext,
  ): Promise<CustomerTransactionsResponse> {
    this.requireTenantScope(actor, tenantId);

    const [clinic, petshop, payments] = await Promise.all([
      this.clinicSales.listClinicSales(
        tenantId,
        {
          customerOwnerId: ownerId,
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
      this.petshopSales.listSales(
        tenantId,
        {
          customerOwnerId: ownerId,
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
      this.payments.listPayments(
        tenantId,
        { limit: 10000, offset: 0 },
        actor,
      ),
    ]);

    const saleIdSet = new Set<string>([
      ...clinic.items.map((s) => s.id),
      ...petshop.items.map((s) => s.id),
    ]);

    const items: CustomerTransaction[] = [];
    for (const sale of clinic.items) {
      items.push({
        id: `sale-${sale.id}`,
        ownerId,
        type: "sale",
        sourceType: "clinic_sale",
        sourceId: sale.id,
        amount: sale.netAmount,
        currency: "TRY",
        occurredAt: sale.completedAt ?? sale.createdAt,
        status: sale.status,
      });
    }
    for (const sale of petshop.items) {
      items.push({
        id: `sale-${sale.id}`,
        ownerId,
        type: "sale",
        sourceType: "petshop_sale",
        sourceId: sale.id,
        amount: sale.netAmount,
        currency: "TRY",
        occurredAt: sale.completedAt ?? sale.createdAt,
        status: sale.status,
      });
    }
    for (const p of payments.items) {
      if (!saleIdSet.has(p.sourceId)) continue;
      // Transaction listesinde effectiveAmount kullanırız; kullanıcı
      // ters kayıt sonrası kalan tutarı görsün.
      items.push({
        id: `pay-${p.id}`,
        ownerId,
        type: "payment",
        sourceType: "payment",
        sourceId: p.id,
        amount: p.effectiveAmount,
        currency: "TRY",
        occurredAt: p.paidAt,
        status: p.status,
      });
    }

    const sort = filters.sort ?? "desc";
    items.sort((a, b) => {
      const cmp = a.occurredAt.localeCompare(b.occurredAt);
      return sort === "desc" ? -cmp : cmp;
    });

    // Filtre uygula (type sonradan).
    let filtered = items;
    if (filters.type) {
      filtered = filtered.filter((it) => it.type === filters.type);
    }
    const total = filtered.length;
    const paged = filtered.slice(filters.offset, filters.offset + filters.limit);
    return {
      ownerId,
      totalCount: total,
      items: paged,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }
}

/* --------------------------------------------------------------------------
 * Dahili decimal yardımcıları
 * -------------------------------------------------------------------------- */

function addDecimal(a: string, b: string): string {
  const A = toBigInt(a);
  const B = toBigInt(b);
  return fromBigInt(A + B);
}

function subDecimal(a: string, b: string): string {
  const A = toBigInt(a);
  const B = toBigInt(b);
  return fromBigInt(A - B);
}

function toBigInt(v: string): bigint {
  const parts = v.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(4, "0").slice(0, 4);
  return BigInt(intPart) * BigInt(10000) + BigInt(fracPart);
}

function fromBigInt(scaled: bigint): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const intPart = abs / BigInt(10000);
  const fracPart = abs % BigInt(10000);
  const intStr = intPart.toString();
  const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return negative && body !== "0" ? `-${body}` : body;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}
