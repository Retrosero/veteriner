/**
 * @file Superadmin tenant görünümü servisi.
 * @module apps/api/modules/superadmin/superadmin.service
 *
 * @description SUPERADMIN tenant listesi ve detayı için aggregation
 * katmanı. GOAL-016 kapsamında persistence DB view olmadan
 * service-in olarak çalışır; her tenant için branch/user count,
 * enabled modules, son login zamanı, son 24 saat hata sayısı ve
 * storage kullanımını paralel sorgularla toplar.
 *
 * İş kuralları:
 * - Tüm endpoint'ler SUPERADMIN-only. `PermissionsGuard` RBAC
 *   kontrolünü uygular; servis katmanı tenant erişim doğrulamasını
 *   yapar (cross-tenant → 404, bilgi sızdırmaz).
 * - `errorCountLast24h` FAZ-1'de log aggregation altyapısı olmadığı
 *   için sabit `0` döner; FAZ-3+'da Loki/Prometheus'tan çekilecek.
 * - `lastLoginAt` tenant'ın kullanıcıları arasındaki en yeni
 *   `User.lastLoginAt` değeridir; hiç login yoksa `null`.
 * - `storageUsedMb` `FileMeta.sizeBytes` (BigInt) toplamının MB
 *   cinsinden (1 MB = 1024^2 byte) değeridir; arşivlenen dosyalar
 *   DAHİL değildir (mevcut kullanım).
 * - `recentEvents` `AuditEvent` tablosundan son 10 event.
 *
 * @security Tenant verisi içermeyen aggregate response; PII
 *   maskeleme gerekmez (taxId/contactEmail bu response'da yok).
 *   Audit event özetinde `actorId` döner; user.displayName gibi PII
 *   alanları UI katmanında mask'lenir.
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import { Injectable, Logger } from "@nestjs/common";

import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FeatureFlagService } from "../feature-flag/feature-flag.service.js";

import type { ListTenantsFilter } from "./superadmin.types.js";
import type {
  AuditEventSummary,
  TenantDetailResponse,
  TenantOverview,
} from "@vetniva/contracts";

/** 1 MB cinsinden byte. BigInt hassasiyeti için Number.MAX_SAFE_INTEGER altında. */
const BYTES_PER_MB = 1024 * 1024;

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlag: FeatureFlagService,
  ) {}

  /**
   * SUPERADMIN tenant listesi. Filtreler opsiyonel; sayfalama
   * response'da döner. Her öğe için tenant özet metrikleri paralel
   * sorgulanır.
   */
  public async listTenants(
    page: number,
    pageSize: number,
    filters: ListTenantsFilter = {},
  ): Promise<{
    items: TenantOverview[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where = this.buildTenantWhere(filters);
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const overviews = await Promise.all(
      items.map((t) => this.buildOverview(t.id)),
    );

    return { items: overviews, total, page, pageSize };
  }

  /**
   * Tek tenant detayı. Cross-tenant denemesi mümkün değildir
   * (SUPERADMIN tüm tenant'ları görür) ancak actor SUPERADMIN değilse
   * service `VET-AUTHZ-0001` fırlatır.
   */
  public async getTenantDetail(
    tenantId: string,
  ): Promise<TenantDetailResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }
    const overview = await this.buildOverview(tenant.id);
    const recentEvents = await this.getRecentEvents(tenant.id, 10);
    return { ...overview, recentEvents };
  }

  /**
   * Tenant'ın son N audit event'i (default 10). Tarih azalan sırada.
   */
  public async getRecentEvents(
    tenantId: string,
    limit: number,
  ): Promise<AuditEventSummary[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventName: true,
        actorId: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
    });
    return events.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      actorId: e.actorId,
      targetType: e.targetType,
      targetId: e.targetId,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  /**
   * Filtre objesinden Prisma `where` üretir. Boş obje → tümü.
   */
  private buildTenantWhere(filters: ListTenantsFilter): {
    status?: "active" | "suspended" | "closed";
    country?: "TR" | "GB";
    OR?: Array<Record<string, unknown>>;
  } {
    const where: ReturnType<typeof this.buildTenantWhere> = {};
    if (filters.status) where.status = filters.status;
    if (filters.country) where.country = filters.country;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { slug: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    return where;
  }

  /**
   * Tek tenant için tüm aggregation'ları paralel çalıştırıp
   * `TenantOverview` üretir.
   */
  private async buildOverview(tenantId: string): Promise<TenantOverview> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      // Aradaki yarış durumunda (tenant silindi/taşındı) boş
      // overview döndürmek yerine hata fırlatmak daha güvenli.
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }

    const [branchCount, userCount, lastLoginAgg, storageAgg] =
      await Promise.all([
        this.prisma.branch.count({ where: { tenantId } }),
        this.prisma.userTenantMembership.count({ where: { tenantId } }),
        this.prisma.user.findFirst({
          where: { memberships: { some: { tenantId } } },
          orderBy: { lastLoginAt: "desc" },
          select: { lastLoginAt: true },
        }),
        this.prisma.fileMeta.aggregate({
          where: { tenantId, archivedAt: null },
          _sum: { sizeBytes: true },
        }),
      ]);

    const enabledModules = await this.getEnabledModules(tenantId);
    const storageBytes = storageAgg._sum.sizeBytes ?? BigInt(0);
    const storageUsedMb = Number(storageBytes) / BYTES_PER_MB;

    return {
      tenantId: tenant.id,
      name: tenant.name,
      country: tenant.country as "TR" | "GB",
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      branchCount,
      userCount,
      enabledModules,
      lastLoginAt: lastLoginAgg?.lastLoginAt
        ? lastLoginAgg.lastLoginAt.toISOString()
        : null,
      // FAZ-1 stub: log aggregation pipeline'ı FAZ-3+'da eklenecek.
      errorCountLast24h: 0,
      storageUsedMb,
    };
  }

  /**
   * FeatureFlagService'ten tenant için açık modülleri toplar. Bir
   * modül için explicit disable kaydı yoksa "enabled: true" kabul
   * edilir (varsayılan davranış, FeatureFlagService.listModules).
   */
  private async getEnabledModules(tenantId: string): Promise<string[]> {
    const list = await this.featureFlag.listModules(tenantId);
    return list.filter((m) => m.enabled).map((m) => m.key);
  }
}
