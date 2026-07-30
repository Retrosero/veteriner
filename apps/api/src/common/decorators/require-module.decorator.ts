/**
 * @file @RequireModule() dekoratörü.
 * @module apps/api/common/decorators/require-module
 *
 * @description Endpoint'in ihtiyaç duyduğu iş modülünü işaretler.
 * `ModuleEnabledGuard` bu metadata'yı okuyup tenant bazında modülün
 * açık/kapalı olduğuna karar verir. Birden fazla modül listelenirse
 * (OR) — yalnızca birinin enabled olması yeterlidir; çoğunlukla
 * tekil kullanılır.
 *
 * @security Bu dekoratör tek başına kontrol YAPMAZ. `ModuleEnabledGuard`
 *   ile birlikte kullanılmalıdır. SUPERADMIN için bypass ayrıca
 *   guard'da uygulanır.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { SetMetadata } from "@nestjs/common";

import type { ModuleKey } from "../modules/module.types.js";

export const REQUIRE_MODULE_KEY = "feature-flag:require-module";

/**
 * Endpoint'in çalışması için gerekli modül(ler)i işaretler.
 * Hiç modül verilmezse guard pasif davranır (geçer).
 */
export const RequireModule = (
  ...modules: ReadonlyArray<ModuleKey>
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_MODULE_KEY, modules as ReadonlyArray<string>);
