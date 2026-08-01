/**
 * @file Reports (temel finans raporları) controller.
 * @module apps/api/modules/reports/reports.controller
 *
 * @description GOAL-076 (FAZ-7) temel finans raporları REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `GET /api/v1/reports/daily-sales?from=YYYY-MM-DD&to=YYYY-MM-DD`
 * - `GET /api/v1/reports/payment-methods?from=YYYY-MM-DD&to=YYYY-MM-DD`
 * - `GET /api/v1/reports/open-balances`
 * - `POST /api/v1/reports/export` (audit üretir)
 *
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  reportDateRangeSchema,
  reportExportInputSchema,
  type DailySalesReport,
  type OpenBalancesReport,
  type PaymentMethodsReport,
  type ReportDateRange,
  type ReportExportInput,
  type ReportExportResponse,
} from "@vetniva/contracts";

import { ReportsService } from "./reports.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("reports")
@UseGuards(PermissionsGuard)
@Controller("api/v1/reports")
export class ReportsController {
  public constructor(private readonly service: ReportsService) {}

  @Get("daily-sales")
  @RequirePermissions("clinic:report:financial:read")
  @ApiOperation({
    operationId: "reportDailySales",
    summary: "Günlük satış özeti",
    description:
      "Verilen tarih aralığında tamamlanmış klinik + petshop " +
      "satışların toplamı. Pilot kapsamında basit toplamlama.",
  })
  public async dailySales(
    @Query(new ZodValidationPipe(reportDateRangeSchema))
    query: ReportDateRange,
    @CurrentActor() actor: ActorContext,
  ): Promise<DailySalesReport> {
    const tenantId = this.requireTenant(actor);
    return this.service.getDailySalesReport(tenantId, query, actor);
  }

  @Get("payment-methods")
  @RequirePermissions("clinic:report:financial:read")
  @ApiOperation({
    operationId: "reportPaymentMethods",
    summary: "Tahsilat yöntemi kırılımı",
    description:
      "Verilen tarih aralığında tamamlanmış tahsilatların yöntem " +
      "bazlı dağılımı (cash/card/bank_transfer/other).",
  })
  public async paymentMethods(
    @Query(new ZodValidationPipe(reportDateRangeSchema))
    query: ReportDateRange,
    @CurrentActor() actor: ActorContext,
  ): Promise<PaymentMethodsReport> {
    const tenantId = this.requireTenant(actor);
    return this.service.getPaymentMethodsReport(tenantId, query, actor);
  }

  @Get("open-balances")
  @RequirePermissions("clinic:report:financial:read")
  @ApiOperation({
    operationId: "reportOpenBalances",
    summary: "Açık bakiye",
    description: "Tamamlanmış satışların tahsil edilmemiş kalan bakiyeleri.",
  })
  public async openBalances(
    @CurrentActor() actor: ActorContext,
  ): Promise<OpenBalancesReport> {
    const tenantId = this.requireTenant(actor);
    return this.service.getOpenBalancesReport(tenantId, actor);
  }

  @Post("export")
  @RequirePermissions("clinic:report:export")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "reportExport",
    summary: "Rapor dışa aktarma",
    description:
      "Belirtilen rapor tipi (daily_sales/payment_methods/" +
      "open_balances) JSON veya CSV formatında dışa aktarılır. " +
      "Audit audit:report.export üretilir.",
  })
  public async export(
    @Body(new ZodValidationPipe(reportExportInputSchema))
    body: ReportExportInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ReportExportResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.exportReport(tenantId, body, actor);
  }

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bağlamı zorunlu",
      httpStatus: 400,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }
}
