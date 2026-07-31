/**
 * @file Vaccine application (aşı uygulama) controller.
 * @module apps/api/modules/vaccines/vaccine-applications.controller
 *
 * @description GOAL-051 aşı uygulama kaydı REST API. Tenant ID
 * URL'de taşınmaz; actor.tenantId'den alınır (cross-tenant IDOR
 * koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/vaccines/applications`            — Yeni uygulama (atomik stok düşümü ile)
 * - `GET    /api/v1/clinic/vaccines/applications`            — Liste + filtre
 * - `GET    /api/v1/clinic/vaccines/applications/:id`        — Detay
 * - `PATCH  /api/v1/clinic/vaccines/applications/:id`        — Düzelt (amend)
 * - `DELETE /api/v1/clinic/vaccines/applications/:id`        — İptal (cancel, stok iade)
 * - `GET    /api/v1/clinic/vaccines/applications/patient/:patientId` — Hasta zaman çizelgesi
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type {
  VaccineApplication,
  VaccineApplicationAmendInput,
  VaccineApplicationCancelInput,
  VaccineApplicationCreateInput,
  VaccineApplicationFilters,
  VaccineApplicationListResponse,
} from "@vetniva/contracts";
import {
  vaccineApplicationAmendInputSchema,
  vaccineApplicationCancelInputSchema,
  vaccineApplicationCreateInputSchema,
  vaccineApplicationFiltersSchema,
} from "@vetniva/contracts";

import { VaccineApplicationsService } from "./vaccine-applications.service.js";

@ApiTags("vaccines")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VaccineApplicationsController {
  public constructor(
    private readonly service: VaccineApplicationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Collection
  // -------------------------------------------------------------------------

  @Post("vaccines/applications")
  @RequirePermissions("clinic:vaccination:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "vaccineApplicationCreate",
    summary: "Yeni aşı uygulama kaydı oluştur",
    description:
      "Bir hayvana aşı uygulaması kaydeder. Aşı kaydı + stok " +
      "düşümü atomiktir. lot SKT'si geçmişse 422 VET-VACC-0002; " +
      "yetersiz stok 422 VET-VACC-0003; tür uyumsuz 422 " +
      "VET-VACC-0006; arşivli protokol 409 VET-VACC-0005. Audit " +
      "`audit:vaccine.application.create` (info).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 422, description: "Geçersiz input / SKT / stok." })
  public async create(
    @Body(new ZodValidationPipe(vaccineApplicationCreateInputSchema))
    body: VaccineApplicationCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineApplication> {
    const tenantId = this.requireTenant(actor);
    return this.service.createApplication(tenantId, body, actor);
  }

  @Get("vaccines/applications")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineApplicationList",
    summary: "Aşı uygulama kayıtları listesi",
    description:
      "patientId / protocolId / status / from / to filtreleri ile " +
      "tenant-scoped arama. Cancelled kayıtlar default hariç.",
  })
  public async list(
    @Query(new ZodValidationPipe(vaccineApplicationFiltersSchema))
    query: VaccineApplicationFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineApplicationListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listApplications(tenantId, query, actor);
  }

  // -------------------------------------------------------------------------
  // Patient timeline
  // -------------------------------------------------------------------------

  @Get("vaccines/applications/patient/:patientId")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineApplicationListByPatient",
    summary: "Hastanın aşı uygulama zaman çizelgesi",
    description:
      "Belirli bir hastanın tüm aşı uygulama kayıtlarını (iptal " +
      "dahil) en yeniden eskiye döner. Cross-tenant patientId → 404.",
  })
  public async listByPatient(
    @Param("patientId") patientId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineApplication[]> {
    const tenantId = this.requireTenant(actor);
    return this.service.listByPatient(tenantId, patientId, actor);
  }

  // -------------------------------------------------------------------------
  // Single
  // -------------------------------------------------------------------------

  @Get("vaccines/applications/:id")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineApplicationGetById",
    summary: "Aşı uygulama kaydı detayı",
    description: "ID'ye göre aşı uygulama kaydı getirir. Cross-tenant → 404.",
  })
  public async getOne(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineApplication> {
    const tenantId = this.requireTenant(actor);
    const a = await this.service.getApplication(tenantId, id, actor);
    if (!a) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return a;
  }

  @Patch("vaccines/applications/:id")
  @RequirePermissions("clinic:vaccination:amend")
  @ApiOperation({
    operationId: "vaccineApplicationAmend",
    summary: "Aşı uygulama kaydını düzelt (amend)",
    description:
      "GOAL-054 amendment. Yalnızca aktif kayıtlar düzeltilebilir " +
      "(status='active'). Düzeltme sonrası status='amended' ve eski " +
      "kayıt korunur (fiziksel silme yok). Değiştirilebilir alanlar: " +
      "dose, nextDueDate, notes, lot. `lot` değişirse eski lot'a " +
      "ters kayıt + yeni lot'tan düşüm hareketi atomik olarak " +
      "oluşturulur. Yeni lot SKT geçmişse 422 VET-VACC-0010; " +
      "yetersiz stok 422 VET-VACC-0009; eski lot değişmez. " +
      "Audit `audit:vaccine.application.amend` (warning) — " +
      "lotChange varsa before/after ayrıca loglanır. Zaten " +
      "düzeltilmiş/iptal edilmiş kayıt → 409 VET-VACC-0007.",
  })
  public async amend(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vaccineApplicationAmendInputSchema))
    body: VaccineApplicationAmendInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineApplication> {
    const tenantId = this.requireTenant(actor);
    return this.service.amendApplication(tenantId, id, body, actor);
  }

  @Delete("vaccines/applications/:id")
  @RequirePermissions("clinic:vaccination:create")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "vaccineApplicationCancel",
    summary: "Aşı uygulama kaydını iptal et (cancel, stok iade)",
    description:
      "status='cancelled' olur; bağlı tüm stok hareketleri ters " +
      "kayıt ile geri alınır. Zaten iptal edilmiş → 409 " +
      "VET-VACC-0008. Audit `audit:vaccine.application.cancel` " +
      "(warning).",
  })
  public async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vaccineApplicationCancelInputSchema))
    body: VaccineApplicationCancelInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.requireTenant(actor);
    await this.service.cancelApplication(tenantId, id, body, actor);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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
