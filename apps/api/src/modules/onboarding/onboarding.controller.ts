/**
 * @file Onboarding (ilk kullanım asistanı) controller.
 * @module apps/api/modules/onboarding/onboarding.controller
 *
 * @description GOAL-117 (FAZ-11) — İlk kullanım asistanı
 * REST endpoint'leri. Kullanıcı "X nasıl yapılır?" sorusunu
 * gönderir; servis role/modül-bazlı senaryo eşleştirir ve
 * adım listesi döner. Tıbbi sorular reddedilir.
 *
 * Endpoint'ler:
 * - `POST /api/v1/onboarding/ask`     → soru sor
 * - `GET  /api/v1/onboarding/scenarios` → role/modül-bazlı liste
 *
 * @security Tenant filtresi zorunlu. SUPERADMIN tüm senaryoları
 *   görür. Tıbbi sorular loglanır (refusal).
 *
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import {
  onboardingAskInputSchema,
  OnboardingService,
  type OnboardingAskResponse,
  type OnboardingRole,
  type OnboardingScenarioListResponse,
} from "../../common/onboarding/index.js";
import { isModuleKey, type ModuleKey } from "../../common/modules/module.types.js";

/**
 * Senaryo listesi için tenant modül filtresi query şeması.
 * Boş bırakılırsa modül filtresi uygulanmaz (tümü varsayılır).
 */
const scenariosQuerySchema = z.object({
  /** Virgülle ayrılmış modül listesi. Ör. `clinic,vaccinations`. */
  modules: z
    .string()
    .max(200)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : undefined,
    ),
});

@Controller("api/v1/onboarding")
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboarding: OnboardingService) {}

  /**
   * `POST /api/v1/onboarding/ask` — kullanıcı "X nasıl
   * yapılır?" sorusunu yanıtla. Tıbbi sorular reddedilir.
   */
  @Post("ask")
  @HttpCode(HttpStatus.OK)
  public async ask(
    @Body() rawBody: unknown,
    @CurrentActor() actor: ActorContext,
  ): Promise<OnboardingAskResponse> {
    const body = onboardingAskInputSchema.parse(rawBody);
    return this.onboarding.ask(body, actor);
  }

  /**
   * `GET /api/v1/onboarding/scenarios` — kullanıcının rolüne
   * göre senaryo listesi. `?modules=clinic,vaccinations` ile
   * modül filtresi uygulanabilir.
   */
  @Get("scenarios")
  public async listScenarios(
    @Query() rawQuery: unknown,
    @CurrentActor() actor: ActorContext,
  ): Promise<OnboardingScenarioListResponse> {
    const query = scenariosQuerySchema.parse(rawQuery ?? {});
    const role = this.toOnboardingRole(actor.role);
    const enabledModules = this.parseEnabledModules(query.modules);
    const result = this.onboarding.listScenarios(role, enabledModules);
    this.logger.log({
      msg: "onboarding.scenarios.list",
      role,
      module_filter: enabledModules?.length ?? 0,
      tenant_id: actor.tenantId,
    });
    return result;
  }

  private toOnboardingRole(role: ActorContext["role"]): OnboardingRole {
    if (role === "SYSTEM") return "OWNER";
    return role;
  }

  private parseEnabledModules(
    raw: string[] | undefined,
  ): ReadonlyArray<ModuleKey> | null {
    if (!raw || raw.length === 0) return null;
    const valid = raw.filter((m): m is ModuleKey => isModuleKey(m));
    return valid.length > 0 ? valid : null;
  }
}
