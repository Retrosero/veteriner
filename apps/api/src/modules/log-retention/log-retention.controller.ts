/**
 * @file Log retention controller.
 * @module apps/api/modules/log-retention/log-retention.controller
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * için SUPERADMIN REST API. Tüm endpoint'ler `audit:log:read`
 * yetkisi gerektirir.
 *
 * Endpoint'ler (SUPERADMIN - audit:log:read):
 * - `GET    /api/v1/superadmin/log-retention/policies`           — Filtreli liste
 * - `GET    /api/v1/superadmin/log-retention/policies/effective` — Effective policy (preview)
 * - `GET    /api/v1/superadmin/log-retention/policies/:id`       — Tek policy
 * - `PUT    /api/v1/superadmin/log-retention/policies`           — Upsert
 * - `DELETE /api/v1/superadmin/log-retention/policies/:id`       — Sil
 * - `POST   /api/v1/superadmin/log-retention/sweeps`             — Sweep tetikle
 * - `GET    /api/v1/superadmin/log-retention/sweeps`             — Sweep geçmişi
 * - `GET    /api/v1/superadmin/log-retention/sweeps/:id`         — Sweep detayı
 *
 * @security SUPERADMIN uçları `audit:log:read` permission'ı
 *   gerektirir. Sweep tetikleme kritik işlemdir; yine de audit
 *   log'a düşülür (sweep kaydında triggeredById ile).
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type LogRetentionSeverity,
  type LogType,
  type RetentionPolicy,
  type RetentionPolicyFilters,
  type RetentionPolicyListResponse,
  type RetentionPolicyUpsert,
  retentionPolicyFiltersSchema,
  retentionPolicyUpsertSchema,
  retentionSweepHistoryFiltersSchema,
  type RetentionSweepHistoryFilters,
  type RetentionSweepHistoryResponse,
  type RetentionSweepResult,
  triggerRetentionSweepSchema,
  type TriggerRetentionSweep,
} from "@vetniva/contracts";

import { LogRetentionService } from "./log-retention.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("superadmin/log-retention")
@UseGuards(PermissionsGuard)
@Controller("api/v1/superadmin/log-retention")
export class LogRetentionController {
  public constructor(private readonly service: LogRetentionService) {}

  /* ------------------------------------------------------------------------
   * Policies
   * ------------------------------------------------------------------------
   */

  @Get("policies")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionPolicyList",
    summary: "Retention policy listesi (SUPERADMIN)",
    description:
      "Tüm tenant override + global policy'leri filtreli olarak listeler. " +
      "tenantId/logType/severity filtreleri; sayfalama zorunlu.",
  })
  public async listPolicies(
    @Query(new ZodValidationPipe(retentionPolicyFiltersSchema))
    query: RetentionPolicyFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionPolicyListResponse> {
    return this.service.listRetentionPolicies(query, actor);
  }

  @Get("policies/effective")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionEffectivePolicy",
    summary: "Effective policy önizleme (SUPERADMIN)",
    description:
      "Tenant + logType + severity kombinasyonu için geçerli policy'yi " +
      "tenantOverride → globalOverride → default sırasıyla döner.",
  })
  public async effective(
    @Query("tenantId") tenantId: string | null | undefined,
    @Query("logType") logType: LogType,
    @Query("severity") severity: LogRetentionSeverity,
    @CurrentActor() actor: ActorContext,
  ): Promise<{
    tenantId: string | null;
    logType: LogType;
    severity: LogRetentionSeverity;
    retentionDays: number;
    archiveAfterDays: number;
    archiveStorage: string;
    redactPii: boolean;
    source: string;
  }> {
    // tenantId query string'de yoksa null olarak kabul edilir
    // (boş string de null sayılır).
    const normalizedTenantId =
      tenantId === undefined || tenantId === "" ? null : tenantId;
    return this.service.getEffectivePolicy(
      normalizedTenantId,
      logType,
      severity,
      actor,
    );
  }

  @Get("policies/:id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionPolicyGet",
    summary: "Tek policy (SUPERADMIN)",
    description: "ID üzerinden tekil policy erişimi.",
  })
  public async getPolicy(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionPolicy> {
    return this.service.getRetentionPolicyById(id, actor);
  }

  @Put("policies")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionPolicyUpsert",
    summary: "Policy upsert (SUPERADMIN)",
    description:
      "(tenantId, logType, severity) anahtarıyla policy oluşturur veya " +
      "günceller. tenantId=null → global override. redactPii alanı " +
      "servis tarafından her zaman true yapılır; caller override edemez.",
  })
  public async upsertPolicy(
    @Body(new ZodValidationPipe(retentionPolicyUpsertSchema))
    body: RetentionPolicyUpsert,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionPolicy> {
    return this.service.upsertRetentionPolicy(body, actor);
  }

  @Delete("policies/:id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionPolicyDelete",
    summary: "Policy sil (SUPERADMIN)",
    description:
      "ID üzerinden policy siler. Effective policy etkisi hemen " +
      "uygulanır; sweep bir sonraki çalıştırmada yeni değerleri kullanır.",
  })
  public async deletePolicy(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ id: string; deleted: boolean }> {
    return this.service.deleteRetentionPolicy(id, actor);
  }

  /* ------------------------------------------------------------------------
   * Sweeps
   * ------------------------------------------------------------------------
   */

  @Post("sweeps")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionSweepTrigger",
    summary: "Sweep tetikle (SUPERADMIN)",
    description:
      "Manuel retention sweep başlatır. Tüm bilinen tenant'lar × logType " +
      "× severity kombinasyonları için effective policy çözer; cutoff'lar " +
      "hesaplar; target repository'ler üzerinden arşiv/sil yapar. " +
      "dryRun=true ise gerçek işlem yapılmaz, yalnız sayım döner.",
  })
  public async triggerSweep(
    @Body(new ZodValidationPipe(triggerRetentionSweepSchema))
    body: TriggerRetentionSweep,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionSweepResult> {
    return this.service.runSweep(body, actor);
  }

  @Get("sweeps")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionSweepHistory",
    summary: "Sweep geçmişi (SUPERADMIN)",
    description:
      "Geçmiş sweep kayıtlarını filtreli olarak listeler. triggeredBy/" +
      "from/to filtreleri; sayfalama zorunlu.",
  })
  public async listSweeps(
    @Query(new ZodValidationPipe(retentionSweepHistoryFiltersSchema))
    query: RetentionSweepHistoryFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionSweepHistoryResponse> {
    return this.service.listSweeps(query, actor);
  }

  @Get("sweeps/:id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "logRetentionSweepDetail",
    summary: "Sweep detayı (SUPERADMIN)",
    description: "Tek sweep kaydı detayı (bucket bazlı sayımlar dahil).",
  })
  public async getSweepDetail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<RetentionSweepResult> {
    return this.service.getSweepDetail(id, actor);
  }
}
