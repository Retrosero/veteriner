/**
 * @file Reports (temel finans raporları) service.
 * @module apps/api/modules/reports/reports.service
 *
 * @description GOAL-076 (FAZ-7) temel finans raporları iş
 * kuralları. Read-only raporlar; cross-module veri toplama
 * yapar (clinic-sales + petshop-sales). Pilot kapsamında
 * basit toplamlama kullanılır; production'da Prisma aggregate.
 *
 * İş kuralları:
 * - `getDailySalesReport`: verilen tarihte (UTC) tamamlanmış
 *   clinic_sale + petshop_sale kayıtlarının toplamı.
 *   `dateFrom`/`dateTo` opsiyonel; tek tarih için ikisi aynı
 *   gün olabilir.
 * - `getOpenBalancesReport`: payments modülü ile cross-module
 *   okuma gerekir. MVP'de yalnızca `clinic_sale` + `petshop_sale`
 *   sourceType'larda; payment verisine erişim için PaymentsService
 *   inject edilir.
 * - `exportReport`: ilgili raporu üretir; format=json|csv. Audit
 *   `audit:report.export` (info).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  DailySalesReport,
  OpenBalanceItem,
  OpenBalancesReport,
  PaymentMethodBreakdownItem,
  PaymentMethodsReport,
  ReportDateRange,
  ReportExportInput,
  ReportExportResponse,
  ReportExportType,
} from "@vetniva/contracts";

import { ClinicSalesService } from "../clinic-sales/clinic-sales.service.js";
import { PetshopSalesService } from "../petshop-sales/petshop-sales.service.js";
import { PaymentsService } from "../payments/payments.service.js";

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  public constructor(
    private readonly clinicSales: ClinicSalesService,
    private readonly petshopSales: PetshopSalesService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // getDailySalesReport
  // -------------------------------------------------------------------------

  public async getDailySalesReport(
    tenantId: string,
    range: ReportDateRange,
    actor: ActorContext,
  ): Promise<DailySalesReport> {
    this.requireTenantScope(actor, tenantId);

    // Tek günlük tarih için from == to olabilir; burada from kullanılır.
    const fromDate = range.from;
    const toDate = range.to;

    const [clinicResult, petshopResult] = await Promise.all([
      this.clinicSales.listClinicSales(
        tenantId,
        {
          sort: "asc",
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
      this.petshopSales.listSales(
        tenantId,
        {
          sort: "asc",
          limit: 10000,
          offset: 0,
        },
        actor,
      ),
    ]);

    const inRange = (iso: string): boolean => {
      const day = iso.slice(0, 10);
      return day >= fromDate && day <= toDate;
    };

    let clinicTotal = "0";
    let clinicCount = 0;
    for (const sale of clinicResult.items) {
      if (sale.status !== "completed") continue;
      if (!inRange(sale.completedAt ?? sale.createdAt)) continue;
      clinicTotal = addDecimal(clinicTotal, sale.netAmount);
      clinicCount += 1;
    }

    let petshopTotal = "0";
    let petshopCount = 0;
    for (const sale of petshopResult.items) {
      if (sale.status !== "completed") continue;
      if (!inRange(sale.completedAt ?? sale.createdAt)) continue;
      petshopTotal = addDecimal(petshopTotal, sale.netAmount);
      petshopCount += 1;
    }

    const combinedTotal = addDecimal(clinicTotal, petshopTotal);
    return {
      date: fromDate,
      currency: "TRY",
      clinicSalesTotal: clinicTotal,
      petshopSalesTotal: petshopTotal,
      combinedTotal,
      clinicSaleCount: clinicCount,
      petshopSaleCount: petshopCount,
      netTotal: combinedTotal,
    };
  }

  // -------------------------------------------------------------------------
  // getPaymentMethodsReport
  // -------------------------------------------------------------------------

  public async getPaymentMethodsReport(
    tenantId: string,
    range: ReportDateRange,
    actor: ActorContext,
  ): Promise<PaymentMethodsReport> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.payments.listPayments(
      tenantId,
      { limit: 10000, offset: 0 },
      actor,
    );
    const inRange = (iso: string): boolean => {
      const day = iso.slice(0, 10);
      return day >= range.from && day <= range.to;
    };
    const byMethod = new Map<
      PaymentMethodBreakdownItem["method"],
      { count: number; total: string }
    >();
    for (const p of result.items) {
      if (p.status !== "completed") continue;
      if (!inRange(p.paidAt)) continue;
      const cur = byMethod.get(p.method) ?? {
        count: 0,
        total: "0",
      };
      cur.count += 1;
      cur.total = addDecimal(cur.total, p.amount);
      byMethod.set(p.method, cur);
    }
    const breakdown: PaymentMethodBreakdownItem[] = [];
    let totalCount = 0;
    let totalAmount = "0";
    for (const [method, v] of byMethod) {
      breakdown.push({
        method,
        count: v.count,
        totalAmount: v.total,
      });
      totalCount += v.count;
      totalAmount = addDecimal(totalAmount, v.total);
    }
    return {
      dateRange: range,
      currency: "TRY",
      totalCount,
      totalAmount,
      breakdown,
    };
  }

  // -------------------------------------------------------------------------
  // getOpenBalancesReport
  // -------------------------------------------------------------------------

  public async getOpenBalancesReport(
    tenantId: string,
    actor: ActorContext,
  ): Promise<OpenBalancesReport> {
    this.requireTenantScope(actor, tenantId);
    const [clinic, petshop] = await Promise.all([
      this.clinicSales.listClinicSales(
        tenantId,
        { status: "completed", limit: 10000, offset: 0 },
        actor,
      ),
      this.petshopSales.listSales(
        tenantId,
        { status: "completed", limit: 10000, offset: 0 },
        actor,
      ),
    ]);
    const items: OpenBalanceItem[] = [];
    for (const sale of clinic.items) {
      const paid = await this.payments.listPayments(tenantId, {
        sourceType: "clinic_sale",
        sourceId: sale.id,
        limit: 10000,
        offset: 0,
      }, actor);
      const paidTotal = sumCompletedPayments(paid.items);
      const open = subDecimal(sale.netAmount, paidTotal);
      if (open !== "0") {
        items.push({
          sourceType: "clinic_sale",
          sourceId: sale.id,
          totalAmount: sale.netAmount,
          paidAmount: paidTotal,
          openAmount: open,
          lastPaymentAt: lastPaymentAt(paid.items),
        });
      }
    }
    for (const sale of petshop.items) {
      const paid = await this.payments.listPayments(tenantId, {
        sourceType: "petshop_sale",
        sourceId: sale.id,
        limit: 10000,
        offset: 0,
      }, actor);
      const paidTotal = sumCompletedPayments(paid.items);
      const open = subDecimal(sale.netAmount, paidTotal);
      if (open !== "0") {
        items.push({
          sourceType: "petshop_sale",
          sourceId: sale.id,
          totalAmount: sale.netAmount,
          paidAmount: paidTotal,
          openAmount: open,
          lastPaymentAt: lastPaymentAt(paid.items),
        });
      }
    }
    let totalOpen = "0";
    for (const it of items) {
      totalOpen = addDecimal(totalOpen, it.openAmount);
    }
    return {
      currency: "TRY",
      totalOpenAmount: totalOpen,
      openItemCount: items.length,
      items,
    };
  }

  // -------------------------------------------------------------------------
  // exportReport
  // -------------------------------------------------------------------------

  public async exportReport(
    tenantId: string,
    input: ReportExportInput,
    actor: ActorContext,
  ): Promise<ReportExportResponse> {
    this.requireTenantScope(actor, tenantId);
    const range: ReportDateRange =
      input.dateRange ?? {
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      };
    let content = "";
    if (input.type === "daily_sales") {
      const report = await this.getDailySalesReport(
        tenantId,
        range,
        actor,
      );
      content =
        input.format === "csv"
          ? toCsv([
              "date",
              "currency",
              "clinicSalesTotal",
              "petshopSalesTotal",
              "combinedTotal",
              "clinicSaleCount",
              "petshopSaleCount",
              "netTotal",
            ], [report])
          : JSON.stringify(report);
    } else if (input.type === "payment_methods") {
      const report = await this.getPaymentMethodsReport(
        tenantId,
        range,
        actor,
      );
      content =
        input.format === "csv"
          ? toCsv(
              [
                "method",
                "count",
                "totalAmount",
              ],
              report.breakdown,
            )
          : JSON.stringify(report);
    } else {
      const report = await this.getOpenBalancesReport(tenantId, actor);
      content =
        input.format === "csv"
          ? toCsv(
              [
                "sourceType",
                "sourceId",
                "totalAmount",
                "paidAmount",
                "openAmount",
                "lastPaymentAt",
              ],
              report.items,
            )
          : JSON.stringify(report);
    }

    await this.audit.recordSimple(
      "audit:report.export",
      "report",
      `export-${input.type}-${Date.now()}`,
      "export",
      this.actorToAuditActor(actor),
      "info",
      {
        type: input.type,
        format: input.format,
        dateRange: range,
        byteSize: content.length,
      },
    );

    return {
      type: input.type,
      format: input.format,
      content,
      generatedAt: new Date().toISOString(),
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

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
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

function sumCompletedPayments(
  payments: ReadonlyArray<{ amount: string; status: string }>,
): string {
  let total = "0";
  for (const p of payments) {
    if (p.status !== "completed") continue;
    total = addDecimal(total, p.amount);
  }
  return total;
}

function lastPaymentAt(
  payments: ReadonlyArray<{ paidAt: string; status: string }>,
): string | null {
  const completed = payments.filter((p) => p.status === "completed");
  if (completed.length === 0) return null;
  return completed
    .map((p) => p.paidAt)
    .sort()
    .reverse()[0] ?? null;
}

function toCsv(
  headers: string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    const cells = headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
