/**
 * @file Global staff auth guard yapılandırması testi.
 * @module apps/api/common/auth/auth-global-guard.spec
 * @description Staff endpoint'lerinin varsayılan olarak AuthGuard ile
 * korunduğunu; health ve portal session akışlarının açık metadata ile
 * staff guard'dan ayrıldığını doğrular.
 */

import { MODULE_METADATA } from "@nestjs/common/constants";
import { APP_GUARD } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { AuthGuard } from "./auth.guard.js";
import { AuthModule } from "./auth.module.js";
import { HealthController } from "../../modules/health/health.controller.js";
import { PortalAppointmentsPortalController } from "../../modules/portal-appointments/portal-appointments.controller.js";
import { PortalAuthController } from "../../modules/portal-auth/portal-auth.controller.js";
import { PortalPetsController } from "../../modules/portal-pets/portal-pets.controller.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

describe("global staff authentication", () => {
  it("AuthGuard'u uygulama geneli guard olarak kaydeder", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AuthModule,
    ) as Array<{ provide?: unknown; useExisting?: unknown }>;

    expect(providers).toContainEqual({
      provide: APP_GUARD,
      useExisting: AuthGuard,
    });
  });

  it("health ve portal session controller'larını staff auth'tan açıkça muaf tutar", () => {
    const publicControllers = [
      HealthController,
      PortalAuthController,
      PortalPetsController,
      PortalAppointmentsPortalController,
    ];

    for (const controller of publicControllers) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true);
    }
  });
});
