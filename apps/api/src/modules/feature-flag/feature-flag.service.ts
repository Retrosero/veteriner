/**
 * @file FeatureFlagService.
 * @module apps/api/modules/feature-flag/feature-flag.service
 *
 * @description Tenant bazında modül açma/kapama iş mantığını
 * taşıyan servis. GOAL-013 kapsamında persistence KATMANI
 * in-memory Map'tir (process-local). İleride (GOAL-020+) Prisma
 * `TenantModule` tablosuna geçirilecek; `enable/disable/list` API
 * imzaları sabit kalacak.
 *
 * Davranış:
 * - `isModuleEnabled(tenantId, moduleKey)`: cache miss'te `true`
 *   döner (default enabled); bilinçli bir disable yoksa "açık"
 *   kabul edilir. Bu yeni tenant onboarding'inin bloklanmasını
 *   engeller.
 * - `enable/disable`: in-memory cache'i günceller + audit event
 *   yazar (bilgi amaçlı; DB yazımı audit'in kendi akışı).
 * - SUPERADMIN bypass: bu servis tarafında YOKTUR; bypass
 *   `ModuleEnabledGuard`'da uygulanır (master switch).
 *
 * @security Cache, process-scoped. Çok-instance deployment'ta
 *   her instance kendi cache'ini tutar; tutarsızlık kabul edilebilir
 *   çünkü flag değişikliği operasyonel/insani bir eylemdir ve
 *   eventual consistency yeterlidir. DB'ye taşındığında bu
 *   not kalkacak.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { Injectable, Logger } from "@nestjs/common";

import { AuditService } from "../../common/audit/audit.service.js";
import {
  ALL_MODULE_KEYS,
  isModuleKey,
  type ModuleKey,
} from "../../common/modules/module.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

/**
 * Tenant + modül durum kaydı. In-memory `Map` anahtarı
 * `${tenantId}::${moduleKey}` formatındadır.
 */
interface ModuleStatus {
  enabled: boolean;
  /** İşlemi yapan actor. */
  actorId: string;
  /** Son güncelleme zamanı (ISO). */
  updatedAt: string;
}

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly cache = new Map<string, ModuleStatus>();

  public constructor(private readonly audit: AuditService) {}

  /**
   * Modülün tenant için açık olup olmadığını döner. Default
   * davranış: `true` (bilinçli disable yoksa açık).
   */
  public async isModuleEnabled(
    tenantId: string,
    moduleKey: string,
  ): Promise<boolean> {
    if (!isModuleKey(moduleKey)) {
      this.logger.warn(`Bilinmeyen modül anahtarı sorgulandı: ${moduleKey}`);
      return false;
    }
    const status = this.cache.get(this.key(tenantId, moduleKey));
    if (!status) return true; // default enabled
    return status.enabled;
  }

  /**
   * Tenant için modülü açar. Audit event: `audit:feature_flag.enable`
   * (info). Operatör geri bildirimi için `metadata` eklenir.
   */
  public async enableModule(
    tenantId: string,
    moduleKey: string,
    actor: ActorContext,
  ): Promise<void> {
    if (!isModuleKey(moduleKey)) {
      throw new Error(`Bilinmeyen modül: ${moduleKey}`);
    }
    const before = this.cache.get(this.key(tenantId, moduleKey));
    this.cache.set(this.key(tenantId, moduleKey), {
      enabled: true,
      actorId: actor.actorId ?? "system",
      updatedAt: new Date().toISOString(),
    });
    await this.audit.record({
      eventName: "audit:feature_flag.enable",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: "user",
      targetType: "tenant_module",
      targetId: `${tenantId}::${moduleKey}`,
      action: "update",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      metadata: {
        module: moduleKey,
        enabled: true,
        previous: before?.enabled ?? true,
      },
    });
  }

  /**
   * Tenant için modülü kapatır. Audit event: `audit:feature_flag.disable`
   * (warning). Operasyonel risk taşıdığı için warning seviyesinde
   * kayıt yazılır.
   */
  public async disableModule(
    tenantId: string,
    moduleKey: string,
    actor: ActorContext,
  ): Promise<void> {
    if (!isModuleKey(moduleKey)) {
      throw new Error(`Bilinmeyen modül: ${moduleKey}`);
    }
    const before = this.cache.get(this.key(tenantId, moduleKey));
    this.cache.set(this.key(tenantId, moduleKey), {
      enabled: false,
      actorId: actor.actorId ?? "system",
      updatedAt: new Date().toISOString(),
    });
    await this.audit.record({
      eventName: "audit:feature_flag.disable",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: "user",
      targetType: "tenant_module",
      targetId: `${tenantId}::${moduleKey}`,
      action: "update",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      metadata: {
        module: moduleKey,
        enabled: false,
        previous: before?.enabled ?? true,
      },
    });
  }

  /**
   * Tenant için tüm modüllerin durumunu döner. Bilinçli disable
   * olmayanlar "enabled: true" olarak listelenir (default davranış).
   */
  public async listModules(
    tenantId: string,
  ): Promise<ReadonlyArray<{ key: ModuleKey; enabled: boolean }>> {
    return ALL_MODULE_KEYS.map((key) => {
      const status = this.cache.get(this.key(tenantId, key));
      return { key, enabled: status?.enabled ?? true };
    });
  }

  /**
   * Test amaçlı: tüm cache'i temizler. Production'da çağrılmamalı.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  private key(tenantId: string, moduleKey: ModuleKey): string {
    return `${tenantId}::${moduleKey}`;
  }
}
