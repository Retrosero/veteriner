/**
 * @file @Public() dekoratörü.
 * @module apps/api/common/decorators/public
 *
 * @description AuthGuard ve PermissionsGuard'ı atlayan endpoint
 * işaretleyicisi. Login, health, public landing gibi auth
 * gerektirmeyen endpoint'lerde kullanılır.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru — ortak decorator'a taşındı
 */

import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "auth:isPublic";

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
