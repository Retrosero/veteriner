/**
 * @file Tenant service.
 * @module apps/api/modules/tenant/tenant.service
 *
 * @description Tenant iş kuralları. Repository üzerinden veri
 * erişimi sağlar; permission kontrolü, audit event yayını, hata
 * yönetimi burada yapılır.
 *
 * İş kuralları:
 * - Tenant oluşturma: yalnızca SUPERADMIN (actor.role === 'SUPERADMIN').
 * - Tenant listeleme: SUPERADMIN tüm tenant'ları görür; tenant
 *   kullanıcısı yalnızca kendi tenant'ını görür.
 * - Tenant güncelleme: SUPERADMIN veya kendi tenant OWNER'ı.
 * - Tenant kapatma: yalnızca SUPERADMIN; kapatılan tenant'ın
 *   audit log'ları korunur (FK yok).
 *
 * @security SUPERADMIN kontrolü service katmanında yapılır. Tenant
 *   izolasyonu audit_events ve branches tablolarında RLS ile;
 *   tenants tablosunda service katmanında uygulanır.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type {
  ActorContext,
  ActorRole,
} from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  CloseTenantRequest,
  CreateTenantRequest,
  TenantListResponse,
  TenantResponse,
  UpdateTenantRequest,
} from "@vetniva/contracts";

import { maskTenantResponse, toTenantResponse } from "./dto/tenant.dto.js";
import type {
  ListTenantsArgs,
  ListTenantsResult,
} from "./tenant.repository.js";
import { TenantRepository } from "./tenant.repository.js";

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  public constructor(
    private readonly repo: TenantRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni tenant oluşturur. Yalnızca SUPERADMIN.
   */
  public async create(
    input: CreateTenantRequest,
    actor: ActorContext,
  ): Promise<TenantResponse> {
    this.requireRole(actor, "SUPERADMIN");

    const slugTaken = await this.repo.existsBySlug(input.slug);
    if (slugTaken) {
      throw new DomainError({
        errorCode: "VET-TENANT-0004",
        message: "Bu tenant slug zaten kayıtlı",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0004",
        details: { slug: input.slug },
      });
    }

    const tenant = await this.repo.create({
      slug: input.slug,
      name: input.name,
      country: input.country,
      ...(input.defaultLocale !== undefined
        ? { defaultLocale: input.defaultLocale }
        : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.taxIdType !== undefined ? { taxIdType: input.taxIdType } : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail }
        : {}),
    });

    await this.audit.record({
      eventName: "audit:tenant.create",
      tenantId: tenant.id,
      branchId: null,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "tenant",
      targetId: tenant.id,
      action: "create",
      correlationId: actor.correlationId,
      country: tenant.country,
      severity: "critical",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: { slug: tenant.slug, name: tenant.name, country: tenant.country },
      metadata: { source: actor.source },
    });

    return toTenantResponse(tenant);
  }

  /**
   * ID'ye göre tenant getirir. SUPERADMIN tüm tenant'ları görür;
   * tenant kullanıcısı yalnızca kendi tenant'ını görür; başka
   * tenant'ı görmeye çalışırsa 404 alır (bilgi sızdırmaz).
   */
  public async findById(
    id: string,
    actor: ActorContext,
  ): Promise<TenantResponse> {
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }
    this.enforceTenantAccess(tenant, actor);
    return this.respondForActor(tenant, actor);
  }

  /**
   * Tenant'ı günceller. SUPERADMIN veya kendi tenant OWNER'ı.
   */
  public async update(
    id: string,
    input: UpdateTenantRequest,
    actor: ActorContext,
  ): Promise<TenantResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }
    this.enforceTenantAccess(existing, actor);
    if (
      actor.role !== "SUPERADMIN" &&
      !(actor.role === "OWNER" && actor.tenantId === existing.id)
    ) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0001",
        message: "Bu işlem için yetkiniz yok",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTHZ-0001",
      });
    }

    const data: Prisma.TenantUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.status !== undefined) data.status = input.status;

    const updated = await this.repo.update(id, data);

    await this.audit.record({
      eventName: "audit:tenant.update",
      tenantId: updated.id,
      branchId: null,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "tenant",
      targetId: updated.id,
      action: "update",
      correlationId: actor.correlationId,
      country: updated.country,
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { name: existing.name, status: existing.status },
      after: { name: updated.name, status: updated.status },
      diff: this.diffFields(existing, updated, [
        "name",
        "status",
        "contactEmail",
        "timezone",
      ]),
    });

    return this.respondForActor(updated, actor);
  }

  /**
   * Tenant'ı kapatır. Yalnızca SUPERADMIN.
   */
  public async close(
    id: string,
    input: CloseTenantRequest,
    actor: ActorContext,
  ): Promise<TenantResponse> {
    this.requireRole(actor, "SUPERADMIN");
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }
    if (existing.status === "closed") {
      throw new DomainError({
        errorCode: "VET-TENANT-0005",
        message: "Tenant zaten kapatılmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0005",
      });
    }
    const closed = await this.repo.close(id, input.reason);

    await this.audit.record({
      eventName: "audit:tenant.close",
      tenantId: closed.id,
      branchId: null,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "tenant",
      targetId: closed.id,
      action: "archive",
      correlationId: actor.correlationId,
      country: closed.country,
      severity: "critical",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { status: existing.status, archivedAt: null },
      after: { status: closed.status, archivedAt: closed.archivedAt },
      metadata: { reason: input.reason },
    });

    return this.respondForActor(closed, actor);
  }

  /**
   * Tenant listeler. SUPERADMIN tüm tenant'ları görür; tenant
   * kullanıcısı yalnızca kendi tenant'ını.
   */
  public async list(
    args: ListTenantsArgs & { actor: ActorContext },
  ): Promise<TenantListResponse> {
    const { actor, ...listArgs } = args;
    // exactOptionalPropertyTypes uyumu: yalnızca set edilmiş alanları
    // repository'ye geçir (undefined yerine "yok" semantiği).
    const repoArgs: ListTenantsArgs = {
      page: listArgs.page,
      pageSize: listArgs.pageSize,
    };
    if (listArgs.status !== undefined) repoArgs.status = listArgs.status;
    if (listArgs.country !== undefined) repoArgs.country = listArgs.country;
    if (listArgs.search !== undefined) repoArgs.search = listArgs.search;

    let result: ListTenantsResult;
    if (actor.role === "SUPERADMIN") {
      result = await this.repo.list(repoArgs);
    } else if (actor.tenantId) {
      result = await this.repo.list({ ...repoArgs, search: actor.tenantId });
      // Tenant kullanıcısı yalnızca kendi tenant'ını görür; slug match
      // yerine ID filter daha doğru.
      const ownItems = result.items.filter((t) => t.id === actor.tenantId);
      result = { items: ownItems, total: ownItems.length };
    } else {
      result = { items: [], total: 0 };
    }

    const canSeePii = actor.role === "SUPERADMIN" || actor.role === "OWNER";
    return {
      items: result.items.map((t) =>
        maskTenantResponse(toTenantResponse(t), canSeePii),
      ),
      total: result.total,
      page: listArgs.page,
      pageSize: listArgs.pageSize,
    };
  }

  /**
   * Actor'ün bu tenant'a erişimi var mı? SUPERADMIN her şeyi görür.
   * Tenant kullanıcısı yalnızca kendi tenant'ını; aksi 404.
   */
  private enforceTenantAccess(
    tenant: { id: string; status: string },
    actor: ActorContext,
  ): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenant.id) {
      if (tenant.status === "closed") {
        throw new DomainError({
          errorCode: "VET-TENANT-0002",
          message: "Tenant kapatılmış",
          httpStatus: 403,
          severity: "error",
          i18nKey: "error.VET-TENANT-0002",
        });
      }
      return;
    }
    // Cross-tenant denemesi → 404 (bilgi sızdırmaz).
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bulunamadı",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }

  /**
   * Rol bazlı erişim kontrolü. Yetersiz → VET-AUTHZ-0005.
   */
  private requireRole(actor: ActorContext, role: ActorRole): void {
    if (actor.role !== role) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0005",
        message: `${role} rolü gerekli`,
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTHZ-0005",
        details: { requiredRole: role, actualRole: actor.role },
      });
    }
  }

  /**
   * PII mask'leme dahil response üretir. Repo'ya gitmeden verilen
   * tenant nesnesinden dönüş yapar; aksi halde `update`/`close` gibi
   * işlemlerde tekrar DB okuması hem gereksiz hem de stale data riski
   * taşır.
   */
  private respondForActor(
    tenant: Parameters<typeof toTenantResponse>[0],
    actor: ActorContext,
  ): TenantResponse {
    const canSeePii = actor.role === "SUPERADMIN" || actor.role === "OWNER";
    return maskTenantResponse(toTenantResponse(tenant), canSeePii);
  }

  /**
   * İki obje arasındaki alan-bazlı farkı üretir (audit diff).
   */
  private diffFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: string[],
  ): Record<string, { from: unknown; to: unknown }> {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      if (before[f] !== after[f]) {
        diff[f] = { from: before[f], to: after[f] };
      }
    }
    return diff;
  }
}
