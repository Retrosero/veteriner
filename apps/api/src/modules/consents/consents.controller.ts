/**
 * @file Consent controller.
 * @module apps/api/modules/consents/consents.controller
 * @description GOAL-081 (FAZ-8) onam formu REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/consents`              — Yeni taslak
 * - `GET    /api/v1/clinic/consents`              — Arama
 * - `GET    /api/v1/clinic/consents/:id`          — Detay
 * - `POST   /api/v1/clinic/consents/:id/sign`     — İmzala
 * - `POST   /api/v1/clinic/consents/:id/revoke`   — Geri çek.
 * @since GOAL-081 (FAZ-8) onam formları core
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
import {
  consentCreateInputSchema,
  consentFiltersSchema,
  consentRevokeInputSchema,
  consentSignInputSchema,
  type Consent,
  type ConsentCreateInput,
  type ConsentFilters,
  type ConsentListResponse,
  type ConsentRevokeInput,
  type ConsentSignInput,
} from "@vetniva/contracts";

import { ConsentsService } from "./consents.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/consents")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/consents")
export class ConsentsController {
  public constructor(private readonly service: ConsentsService) {}

  @Post()
  @RequirePermissions("clinic:consent:sign")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "consentCreate",
    summary: "Yeni onam formu (taslak)",
    description:
      "Surgery/anesthesia/procedure şablonu + versiyon + hasta " +
      "+ sahip + opsiyonel source (surgery_plan/lab_order).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(consentCreateInputSchema))
    body: ConsentCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Consent> {
    const tenantId = this.requireTenant(actor);
    return this.service.createConsent(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:consent:read")
  @ApiOperation({
    operationId: "consentList",
    summary: "Onam formu arama",
    description:
      "Tenant-scoped arama. status/templateType/patientId/" +
      "ownerId/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(consentFiltersSchema))
    query: ConsentFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ConsentListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listConsents(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:consent:read")
  @ApiOperation({
    operationId: "consentGetById",
    summary: "Onam formu detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Consent> {
    const tenantId = this.requireTenant(actor);
    const c = await this.service.getConsentDetail(tenantId, id, actor);
    if (!c) {
      throw new DomainError({
        errorCode: "VET-CONSENT-0001",
        message: "Onam formu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CONSENT-0001",
      });
    }
    return c;
  }

  @Post(":id/sign")
  @RequirePermissions("clinic:consent:sign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "consentSign",
    summary: "Onam formu imzalama",
    description:
      "draft → signed. signatureMethod zorunlu. İmzalanmış " +
      "form tekrar imzalanamaz (409 VET-CONSENT-0002).",
  })
  public async sign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(consentSignInputSchema))
    body: ConsentSignInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Consent> {
    const tenantId = this.requireTenant(actor);
    return this.service.signConsent(tenantId, id, body, actor);
  }

  @Post(":id/revoke")
  @RequirePermissions("clinic:consent:sign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "consentRevoke",
    summary: "Onam formu geri çekme",
    description:
      "signed → revoked. Taslak geri çekilemez (409 " +
      "VET-CONSENT-0004). Zaten revoked 409 VET-CONSENT-0003.",
  })
  public async revoke(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(consentRevokeInputSchema))
    body: ConsentRevokeInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Consent> {
    const tenantId = this.requireTenant(actor);
    return this.service.revokeConsent(tenantId, id, body, actor);
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
