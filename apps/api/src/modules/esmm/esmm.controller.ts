/**
 * @file EsmmDocument controller.
 * @module apps/api/modules/esmm/esmm.controller
 *
 * @description GOAL-077 (FAZ-7) e-SMM belge REST API.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/esmm/documents`              — Yeni belge (taslak)
 * - `GET    /api/v1/esmm/documents`              — Arama
 * - `GET    /api/v1/esmm/documents/:id`          — Detay
 * - `POST   /api/v1/esmm/documents/:id/submit`   — Provider'a gönder
 * - `POST   /api/v1/esmm/documents/:id/retry`    — Yeniden dene
 * - `POST   /api/v1/esmm/documents/:id/cancel`   — İptal
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  esmmDocumentCreateInputSchema,
  esmmDocumentFiltersSchema,
  esmmSubmitDocumentInputSchema,
  type EsmmDocument,
  type EsmmDocumentCreateInput,
  type EsmmDocumentFilters,
  type EsmmDocumentListResponse,
  type EsmmSubmitDocumentInput,
} from "@vetniva/contracts";

import { EsmmDocumentsService } from "./esmm.service.js";

@ApiTags("esmm/documents")
@UseGuards(PermissionsGuard)
@Controller("api/v1/esmm/documents")
export class EsmmDocumentsController {
  public constructor(
    private readonly service: EsmmDocumentsService,
  ) {}

  @Post()
  @RequirePermissions("audit:log:read")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "esmmDocumentCreate",
    summary: "Yeni e-SMM belge taslağı",
    description:
      "e-Fatura/e-Arşiv/e-İrsaliye taslak. `manualDocumentNumber` " +
      "opsiyonel; verildiyse tenant içinde benzersiz olmalı.",
  })
  public async create(
    @Body(new ZodValidationPipe(esmmDocumentCreateInputSchema))
    body: EsmmDocumentCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocument> {
    const tenantId = this.requireTenant(actor);
    return this.service.createDocument(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "esmmDocumentList",
    summary: "e-SMM belge arama",
    description:
      "Tenant-scoped arama. type/status/sourceType/sourceId " +
      "filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(esmmDocumentFiltersSchema))
    query: EsmmDocumentFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocumentListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listDocuments(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "esmmDocumentGetById",
    summary: "e-SMM belge detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocument> {
    const tenantId = this.requireTenant(actor);
    const doc = await this.service.getDocument(tenantId, id, actor);
    if (!doc) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0001",
      });
    }
    return doc;
  }

  @Post(":id/submit")
  @RequirePermissions("audit:log:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "esmmDocumentSubmit",
    summary: "Provider'a gönderim",
    description:
      "draft/failed/rejected → adapter.submitDocument. Mock " +
      "provider idempotencyKey ile duplicate üretmez. accepted " +
      "ise 409 VET-ESMM-0002.",
  })
  public async submit(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(esmmSubmitDocumentInputSchema))
    body: EsmmSubmitDocumentInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocument> {
    const tenantId = this.requireTenant(actor);
    return this.service.submitDocument(tenantId, id, body, actor);
  }

  @Post(":id/retry")
  @RequirePermissions("audit:log:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "esmmDocumentRetry",
    summary: "Yeniden dene",
    description:
      "Yalnızca `failed` veya `rejected` durumdaki belgeler " +
      "tekrar denenebilir. accepted/cancelled/draft için 409.",
  })
  public async retry(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(esmmSubmitDocumentInputSchema))
    body: EsmmSubmitDocumentInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocument> {
    const tenantId = this.requireTenant(actor);
    return this.service.retryDocument(tenantId, id, body, actor);
  }

  @Post(":id/cancel")
  @RequirePermissions("audit:log:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "esmmDocumentCancel",
    summary: "Belge iptali",
    description:
      "draft/pending/failed/rejected/accepted → cancelled. " +
      "accepted ise provider'da da iptal denenir (mock no-op).",
  })
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<EsmmDocument> {
    const tenantId = this.requireTenant(actor);
    return this.service.cancelDocument(tenantId, id, actor);
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
