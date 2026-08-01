/**
 * @file FeatureFlagController.
 * @module apps/api/modules/feature-flag/feature-flag.controller
 *
 * @description Modül/feature flag yönetimi REST endpoint'leri.
 * Yalnızca SUPERADMIN veya tenant OWNER rolündeki kullanıcılar
 * erişebilir (`tenant:tenant:update` permission'ı paylaşılır;
 * ileride ayrı `feature-flag:module:update` eklenebilir).
 *
 * Endpoint'ler:
 * - `GET  /api/v1/modules`             — tenant modül listesi
 * - `PATCH /api/v1/modules/:key`        — modül enable/disable
 *
 * @security Permission guard + tenant scope kontrolü. SUPERADMIN
 *   her tenant için değişiklik yapabilir; normal kullanıcı yalnızca
 *   kendi tenant'ı (`actor.tenantId`) üzerinde.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { FeatureFlagService } from "./feature-flag.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { isModuleKey } from "../../common/modules/module.types.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { ModuleKey } from "../../common/modules/module.types.js";

const setModuleEnabledSchema = z.object({
  enabled: z.boolean(),
});

@ApiTags("modules")
@UseGuards(PermissionsGuard)
@Controller("api/v1/modules")
export class FeatureFlagController {
  public constructor(private readonly service: FeatureFlagService) {}

  /**
   * Aktif tenant için tüm modüllerin durumunu listeler.
   */
  @Get()
  @RequirePermissions("tenant:tenant:read")
  @ApiOperation({
    operationId: "moduleList",
    summary: "Modül listesi (feature flag)",
    description:
      "Aktif tenant için tüm modüllerin enable/disable durumunu döner.",
  })
  @ApiResponse({ status: 200, description: "Modül listesi döner." })
  public async list(@CurrentActor() actor: ActorContext): Promise<{
    items: ReadonlyArray<{ key: ModuleKey; enabled: boolean }>;
  }> {
    const tenantId = this.requireTenant(actor);
    const items = await this.service.listModules(tenantId);
    return { items };
  }

  /**
   * Modülü enable/disable yapar. SUPERADMIN farklı tenant için
   * kullanmak isterse ileride `?tenantId=` query'si eklenebilir
   * (şimdilik yalnızca aktif tenant).
   */
  @Patch(":key")
  @RequirePermissions("tenant:tenant:update")
  @ApiOperation({
    operationId: "moduleSetEnabled",
    summary: "Modül enable/disable",
    description:
      "Aktif tenant için verilen modülü açar veya kapatır. Audit event yazılır.",
  })
  @ApiResponse({ status: 200, description: "Modül güncellendi." })
  @ApiResponse({ status: 400, description: "Bilinmeyen modül anahtarı." })
  public async setEnabled(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(setModuleEnabledSchema))
    body: { enabled: boolean },
    @CurrentActor() actor: ActorContext,
  ): Promise<{ key: ModuleKey; enabled: boolean }> {
    if (!isModuleKey(key)) {
      throw new BadRequestException({
        errorCode: "VET-VALIDATION-0001",
        message: "Bilinmeyen modül anahtarı",
        i18nKey: "error.VET-VALIDATION-0001",
        details: { key },
      });
    }
    const tenantId = this.requireTenant(actor);
    if (body.enabled) {
      await this.service.enableModule(tenantId, key, actor);
    } else {
      await this.service.disableModule(tenantId, key, actor);
    }
    return { key, enabled: body.enabled };
  }

  /**
   * Actor'da tenant bağlamı yoksa reddeder. Modül yönetimi
   * tenant-scoped bir işlemdir.
   */
  private requireTenant(actor: ActorContext): string {
    if (!actor.tenantId) {
      throw new BadRequestException({
        errorCode: "VET-VALIDATION-0001",
        message: "Aktif tenant bağlamı bulunamadı",
        i18nKey: "error.VET-VALIDATION-0001",
      });
    }
    return actor.tenantId;
  }
}
