/**
 * @file Tenant repository.
 * @module apps/api/modules/tenant/tenant.repository
 *
 * @description Tenant veri erişim katmanı. PrismaClient üzerinden
 * sorgu yapar; tenant izolasyonu RLS tarafından sağlanır. Uygulama
 * katmanında SUPERADMIN kontrolü repository'de değil, service'te
 * yapılır (policy sözleşmesi).
 *
 * @security RLS: branches ve audit_events tablolarında aktif.
 *   tenants tablosunda RLS yoktur çünkü SUPERADMIN tüm tenant'ları
 *   görmelidir; tenant kapsamı service katmanında uygulanır.
 *   `findByIdForUser` çağrısı, actor.tenantId null değilse
 *   `tenantId = actor.tenantId` filtresi uygular.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { Prisma, Tenant } from "@prisma/client";

export interface ListTenantsArgs {
  page: number;
  pageSize: number;
  status?: "active" | "suspended" | "closed";
  country?: "TR" | "GB";
  search?: string;
}

export interface ListTenantsResult {
  items: Tenant[];
  total: number;
}

@Injectable()
export class TenantRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Slug'a göre tenant bulur. SUPERADMIN tüm tenant'ları görebilir
   * (RLS yok); tenant kapsamı service'te uygulanır.
   */
  public async findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  /**
   * ID'ye göre tenant bulur.
   */
  public async findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  /**
   * Yeni tenant oluşturur. Slug unique constraint'i DB tarafından
   * sağlanır; çakışma durumunda Prisma `P2002` hatası fırlatır
   * (service VET-TENANT-0004'e map eder).
   */
  public async create(data: {
    slug: string;
    name: string;
    country: string;
    defaultLocale?: string;
    timezone?: string;
    taxId?: string;
    taxIdType?: string;
    contactEmail?: string;
  }): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        slug: data.slug,
        name: data.name,
        country: data.country,
        ...(data.defaultLocale !== undefined
          ? { defaultLocale: data.defaultLocale }
          : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
        ...(data.taxIdType !== undefined ? { taxIdType: data.taxIdType } : {}),
        ...(data.contactEmail !== undefined
          ? { contactEmail: data.contactEmail }
          : {}),
      },
    });
  }

  /**
   * Tenant bilgilerini günceller.
   */
  public async update(
    id: string,
    data: Prisma.TenantUpdateInput,
  ): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  /**
   * Tenant'ı kapatır (soft delete). `archivedAt` ve `archivedReason`
   * set edilir; fiziksel silme YOK.
   */
  public async close(id: string, reason: string): Promise<Tenant> {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: "closed",
        archivedAt: new Date(),
        archivedReason: reason,
      },
    });
  }

  /**
   * Sayfalı liste. Filtre olarak status, country ve search kabul eder.
   * SUPERADMIN tüm tenant'ları görür (RLS yok); tenant kullanıcısı
   * yalnızca kendi tenant'ını görmeli (service katmanı filtreler).
   */
  public async list(args: ListTenantsArgs): Promise<ListTenantsResult> {
    const where: Prisma.TenantWhereInput = {};
    if (args.status) where.status = args.status;
    if (args.country) where.country = args.country;
    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: "insensitive" } },
        { slug: { contains: args.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Slug çakışma kontrolü. Create/update öncesi çağrılır.
   */
  public async existsBySlug(
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!found) return false;
    if (excludeId && found.id === excludeId) return false;
    return true;
  }
}
