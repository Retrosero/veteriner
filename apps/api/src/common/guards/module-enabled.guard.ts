/**
 * @file ModuleEnabledGuard.
 * @module apps/api/common/guards/module-enabled
 *
 * @description `@RequireModule(...)` dekoratörü ile işaretlenmiş
 * endpoint'lerde, ilgili modülün tenant için açık olup olmadığını
 * `FeatureFlagService` üzerinden kontrol eder. Modül devre dışıysa
 * 403 `VET-MODULE-0001` fırlatır.
 *
 * Kurallar:
 * - `@RequireModule()` dekoratörü yoksa guard pasif (geçer).
 * - SUPERADMIN tüm modüllerden bağımsız geçer (master switch).
 * - Birden fazla modül listelenmişse OR: en az biri enabled yeterli.
 * - Actor context yoksa default davranış: guard pasif. Auth
 *   katmanı GOAL-011 sonrası buna zaten engel olur.
 *
 * @security Modül kapalıyken erişim denemesi audit EDİLMEZ
 *   (sinyal/şüphe ayrımı için ileride eklenebilir). Yalnızca
 *   standart 403 hatası döner.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { DomainError } from "../errors/domain-error.js";
import type { ActorContext } from "../actor/actor-context.service.js";
import { isModuleKey } from "../modules/module.types.js";
import type { ModuleKey } from "../modules/module.types.js";
import { REQUIRE_MODULE_KEY } from "../decorators/require-module.decorator.js";
import { FeatureFlagService } from "../../modules/feature-flag/feature-flag.service.js";

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ReadonlyArray<ModuleKey>>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) return true; // Auth katmanı sonra reddedecek.

    // SUPERADMIN master switch.
    if (actor.isSuperadmin) return true;

    // tenantId yoksa modül kapsamı belirsiz; guard pasif bırakılmaz —
    // 403 ile net reddedilir (bilgi sızdırmaz).
    if (!actor.tenantId) {
      throw moduleDisabledError(required[0] ?? "clinic");
    }

    for (const key of required) {
      if (!isModuleKey(key)) continue;
      const enabled = await this.flags.isModuleEnabled(actor.tenantId, key);
      if (enabled) return true;
    }

    throw moduleDisabledError(required[0] ?? "clinic");
  }
}

/**
 * Modülün tenant için kapalı olduğunu belirten standart 403 hatası.
 * `VET-MODULE-0001`: hata kataloğunda tanımlı tek module-disabled
 * kodu; details içinde hangi modülün reddedildiği döner.
 */
export function moduleDisabledError(module: ModuleKey): DomainError {
  return new DomainError({
    errorCode: "VET-MODULE-0001",
    message: "Bu modül tenant için devre dışı",
    httpStatus: 403,
    severity: "warning",
    i18nKey: "error.VET-MODULE-0001",
    details: { module },
  });
}
