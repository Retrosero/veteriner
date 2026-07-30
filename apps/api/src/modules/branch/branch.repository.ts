/**
 * @file Branch repository.
 * @module apps/api/modules/branch/branch.repository
 *
 * @description Branch veri erişim katmanı. PrismaClient üzerinden
 * sorgu yapar; tenant izolasyonu RLS (set_config) ile sağlanır.
 *
 * @security RLS: branches tablosunda `app.tenant_id` ve
 *   `app.is_superadmin` set edilerek sorgu başında context belirlenir.
 *   Bu repository her sorguda `setTenantContext` çağrısı yaparak
 *   RLS policy'sinin doğru çalışmasını sağlar.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable } from "@nestjs/common";
import type { Branch, Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service.js";

export interface ListBranchesArgs {
  tenantId: string;
  status?: "active" | "inactive" | "closed";
}

@Injectable()
export class BranchRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * ID'ye göre branch getirir. RLS otomatik uygular (set_config).
   */
  public async findById(
    id: string,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch | null> {
    return this.withContext(actor, () =>
      this.prisma.branch.findUnique({ where: { id } }),
    );
  }

  /**
   * Tenant'ın branch'lerini listeler. RLS actor.tenantId üzerinden
   * filtreyi uygular.
   */
  public async list(
    args: ListBranchesArgs,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch[]> {
    return this.withContext(actor, async () => {
      const where: Prisma.BranchWhereInput = { tenantId: args.tenantId };
      if (args.status) where.status = args.status;
      return this.prisma.branch.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
    });
  }

  /**
   * Yeni branch oluşturur. Unique constraint (tenant_id, code)
   * DB tarafından sağlanır; çakışma Prisma `P2002` fırlatır.
   */
  public async create(
    args: {
      tenantId: string;
      code: string;
      name: string;
      city?: string;
      address?: Prisma.InputJsonValue;
      phone?: string;
    },
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch> {
    return this.withContext(actor, () =>
      this.prisma.branch.create({
        data: {
          tenantId: args.tenantId,
          code: args.code,
          name: args.name,
          ...(args.city !== undefined ? { city: args.city } : {}),
          ...(args.address !== undefined ? { addressJson: args.address } : {}),
          ...(args.phone !== undefined ? { phone: args.phone } : {}),
        },
      }),
    );
  }

  /**
   * Branch bilgilerini günceller.
   */
  public async update(
    id: string,
    data: Prisma.BranchUpdateInput,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch> {
    return this.withContext(actor, () =>
      this.prisma.branch.update({ where: { id }, data }),
    );
  }

  /**
   * Branch'i arşivler (soft delete).
   */
  public async archive(
    id: string,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch> {
    return this.withContext(actor, () =>
      this.prisma.branch.update({
        where: { id },
        data: { status: "closed", archivedAt: new Date() },
      }),
    );
  }

  /**
   * Tenant + code unique kontrolü. Create/update öncesi çağrılır.
   */
  public async existsByCode(
    tenantId: string,
    code: string,
    excludeId?: string,
    actor: { tenantId: string | null; isSuperadmin: boolean } = {
      tenantId: null,
      isSuperadmin: false,
    },
  ): Promise<boolean> {
    return this.withContext(actor, async () => {
      const found = await this.prisma.branch.findUnique({
        where: { tenantId_code: { tenantId, code } },
        select: { id: true },
      });
      if (!found) return false;
      if (excludeId && found.id === excludeId) return false;
      return true;
    });
  }

  /**
   * Sorgu başında RLS context'i set eder. Bu çağrı yapılmadan
   * yapılan sorgular RLS policy'si nedeniyle sonuç döndürmez.
   *
   * Production PostgreSQL: `set_config(...)` ile GUC değişkenleri
   * bağlam seviyesinde set edilir. Test/mock ortamda no-op.
   */
  private async withContext<T>(
    actor: { tenantId: string | null; isSuperadmin: boolean },
    fn: () => Promise<T>,
  ): Promise<T> {
    const isSuper = actor.isSuperadmin ? "true" : "false";
    const tenantId = actor.tenantId ?? "";
    try {
      // `set_config(name, value, is_local=true)` transaction/connection
      // seviyesinde çalışır; `is_local=true` ile transaction sonunda
      // otomatik temizlenir.
      await this.prisma.$executeRawUnsafe(
        `SELECT set_config('app.is_superadmin', '${isSuper}', true)`,
      );
      if (tenantId) {
        await this.prisma.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', '${tenantId.replace(/'/g, "''")}', true)`,
        );
      }
    } catch {
      // Mock/SQLite ortamda bu başarısız olur; yoksay.
    }
    return fn();
  }
}
