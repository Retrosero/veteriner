/**
 * @file KVKK controller.
 * @module apps/api/modules/kvkk/kvkk.controller
 *
 * @description GOAL-126 (FAZ-12) KVKK ve UK GDPR uyumlu veri
 *   yaşam döngüsü REST API. Tenant ID URL'de taşınmaz;
 *   `actor.tenantId`'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/kvkk/erasure-requests`
 *     Yeni talep. Permission: `clinic:owner:read` (OWNER + portal).
 *     Idempotency-Key header desteklenir.
 * - `GET  /api/v1/kvkk/erasure-requests`
 *     Liste. Permission: `kvkk:erasure:read` (SUPERADMIN).
 * - `POST /api/v1/kvkk/erasure-requests/:id/apply`
 *     Uygulama. Permission: `kvkk:erasure:read` (SUPERADMIN).
 * - `GET  /api/v1/kvkk/export`
 *     Tenant JSON export. Permission: `clinic:tenant:export`
 *     (OWNER + SUPERADMIN).
 *
 * @security Tüm aksiyonlar `audit:kvkk.*` event'i üretir.
 *   Cross-tenant erasure talepleri 403 `VET-KVKK-0004` ile reddedilir.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  kvkkErasureRequestInputSchema,
  kvkkErasureRequestListQuerySchema,
  type KvkkErasureApplyResponse,
  type KvkkErasureRequest,
  type KvkkErasureRequestInput,
  type KvkkErasureRequestListQuery,
  type KvkkErasureRequestListResponse,
  type KvkkTenantDataExport,
} from "@vetniva/contracts";

import { KvkkService } from "./kvkk.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("kvkk")
@UseGuards(PermissionsGuard)
@Controller("api/v1/kvkk")
export class KvkkController {
  public constructor(
    private readonly service: KvkkService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni erasure talebi oluşturur. `Idempotency-Key` header
   * opsiyonel; metadata'da saklanır (audit trail).
   */
  @Post("erasure-requests")
  @RequirePermissions("clinic:owner:read")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "kvkkErasureRequestCreate",
    summary: "Yeni KVKK silme talebi",
    description:
      "OWNER veya SUPERADMIN hasta sahibi için erasure talebi " +
      "oluşturur. Talep `pending` statüsünde döner; SUPERADMIN " +
      "`/apply` ile uygulayabilir.",
  })
  @ApiResponse({ status: 201, description: "Talep oluşturuldu." })
  @ApiResponse({ status: 403, description: "Cross-tenant erasure." })
  @ApiResponse({ status: 422, description: "Validation hatası." })
  public async createErasureRequest(
    @Body(new ZodValidationPipe(kvkkErasureRequestInputSchema))
    body: KvkkErasureRequestInput,
    @CurrentActor() actor: ActorContext,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<KvkkErasureRequest> {
    const request = await this.service.createErasureRequest(
      actor,
      body,
      idempotencyKey,
    );
    // Audit: erasure talep açıldı (warning — PII içeren aksiyon).
    await this.audit.record({
      eventName: "audit:kvkk.erasure.requested",
      tenantId: request.tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "kvkk_erasure_request",
      targetId: request.id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        status: request.status,
        ownerId: request.ownerId,
        reason: request.reason,
      },
      metadata: idempotencyKey ? { idempotencyKey } : null,
    });
    return request;
  }

  /**
   * Erasure taleplerini listeler. Yalnızca SUPERADMIN
   * (`kvkk:erasure:read`).
   */
  @Get("erasure-requests")
  @RequirePermissions("kvkk:erasure:read")
  @ApiOperation({
    operationId: "kvkkErasureRequestList",
    summary: "Erasure talepleri (SUPERADMIN)",
    description:
      "Tüm tenant'ların erasure taleplerini filtreli ve sayfalı " +
      "listeler. status/ownerId opsiyonel filtre.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async listErasureRequests(
    @Query(new ZodValidationPipe(kvkkErasureRequestListQuerySchema))
    query: KvkkErasureRequestListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<KvkkErasureRequestListResponse> {
    return this.service.listErasureRequests(actor, query);
  }

  /**
   * Erasure talebini uygular. PII alanlarını Owner üzerinde
   * anonimleştirir; tıbbi kayıtlar yasal saklama süresince
   * korunur.
   */
  @Post("erasure-requests/:id/apply")
  @RequirePermissions("kvkk:erasure:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "kvkkErasureApply",
    summary: "Erasure uygula (SUPERADMIN)",
    description:
      "PII alanlarını (firstName, lastName, email, phone, taxId, " +
      "address) `kvkk-erased-<hash>` formatında anonimleştirir. " +
      "Tıbbi kayıtlar yasal saklama (7 yıl) süresince tutulur.",
  })
  @ApiResponse({ status: 200, description: "Erasure uygulandı." })
  @ApiResponse({ status: 404, description: "Talep bulunamadı." })
  @ApiResponse({ status: 409, description: "Talep zaten işlenmiş." })
  public async applyErasure(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<KvkkErasureApplyResponse> {
    const result = await this.service.applyErasure(actor, id);
    // Audit: erasure uygulandı (warning — geri dönülemez PII
    // değişikliği).
    await this.audit.record({
      eventName: "audit:kvkk.erasure.applied",
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "kvkk_erasure_request",
      targetId: id,
      action: "complete",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        redacted: result.redacted,
        retained: result.retained,
      },
    });
    return result;
  }

  /**
   * Tenant verisinin JSON export'ı (KVKK Madde 11 + UK GDPR
   * Madde 15).
   */
  @Get("export")
  @RequirePermissions("clinic:tenant:export")
  @ApiOperation({
    operationId: "kvkkTenantDataExport",
    summary: "Tenant JSON export (KVKK Madde 11)",
    description:
      "Tenant verisinin tamamını JSON formatında dışa aktarır. " +
      "PII alanları mask'lenmez (veri sahibinin kendi verisi).",
  })
  @ApiResponse({ status: 200, description: "Export döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async exportTenantData(
    @CurrentActor() actor: ActorContext,
  ): Promise<KvkkTenantDataExport> {
    const result = await this.service.exportTenantData(actor);
    // Audit: export alındı (info).
    await this.audit.record({
      eventName: "audit:kvkk.export.applied",
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "tenant",
      targetId: actor.tenantId ?? "unknown",
      action: "export",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        format: "json",
        exportedAt: result.exportedAt,
      },
    });
    return result;
  }
}
