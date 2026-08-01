/**
 * @file Branch repository.
 * @module apps/api/modules/branch/branch.repository
 * @description Branch veri erişim katmanı. PrismaClient üzerinden
 * sorgu yapar; tenant izolasyonu RLS (set_config) ile sağlanır.
 * @security RLS: branches tablosunda `app.tenant_id` ve
 *   `app.is_superadmin` set edilerek sorgu başında context belirlenir.
 *   Bu repository her sorguda `setTenantContext` çağrısı yaparak
 *   RLS policy'sinin doğru çalışmasını sağlar.
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { Branch, Prisma } from "@prisma/client";

export interface ListBranchesArgs {
  tenantId: string;
  status?: "active" | "inactive" | "closed";
}

@Injectable()
export class BranchRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * ID'ye göre branch getirir. RLS otomatik uygular (set_config).
   * @param id
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
   */
  public async findById(
    id: string,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch | null> {
    return this.withContext(actor, (tx) =>
      tx.branch.findUnique({ where: { id } }),
    );
  }

  /**
   * Tenant'ın branch'lerini listeler. RLS actor.tenantId üzerinden
   * filtreyi uygular.
   * @param args
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
   */
  public async list(
    args: ListBranchesArgs,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch[]> {
    return this.withContext(actor, async (tx) => {
      const where: Prisma.BranchWhereInput = { tenantId: args.tenantId };
      if (args.status) where.status = args.status;
      return tx.branch.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
    });
  }

  /**
   * Yeni branch oluşturur. Unique constraint (tenant_id, code)
   * DB tarafından sağlanır; çakışma Prisma `P2002` fırlatır.
   * @param args
   * @param args.tenantId
   * @param args.code
   * @param args.name
   * @param args.city
   * @param args.address
   * @param args.phone
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
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
    return this.withContext(actor, (tx) =>
      tx.branch.create({
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
   * @param id
   * @param data
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
   */
  public async update(
    id: string,
    data: Prisma.BranchUpdateInput,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch> {
    return this.withContext(actor, (tx) =>
      tx.branch.update({ where: { id }, data }),
    );
  }

  /**
   * Branch'i arşivler (soft delete).
   * @param id
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
   */
  public async archive(
    id: string,
    actor: { tenantId: string | null; isSuperadmin: boolean },
  ): Promise<Branch> {
    return this.withContext(actor, (tx) =>
      tx.branch.update({
        where: { id },
        data: { status: "closed", archivedAt: new Date() },
      }),
    );
  }

  /**
   * Tenant + code unique kontrolü. Create/update öncesi çağrılır.
   * @param tenantId
   * @param code
   * @param excludeId
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
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
    return this.withContext(actor, async (tx) => {
      const found = await tx.branch.findUnique({
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
   * Production PostgreSQL: `set_config(...)` ile GUC değişkenleri aynı
   * transaction ve fiziksel bağlantı üzerinde kurulur. Transaction dışında
   * `is_local=true` kullanmak bağlamı ilk statement sonunda sileceğinden,
   * bu repository hata durumunda fail-closed davranır.
   * @param actor
   * @param actor.tenantId
   * @param actor.isSuperadmin
   * @param fn
   */
  private async withContext<T>(
    actor: { tenantId: string | null; isSuperadmin: boolean },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const isSuper = actor.isSuperadmin ? "true" : "false";
    const tenantId = actor.tenantId ?? "";
    return this.prisma.$transaction(async (tx) => {
      // `set_config(name, value, is_local=true)` transaction/connection
      // seviyesinde çalışır; `is_local=true` ile transaction sonunda
      // otomatik temizlenir.
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', ${isSuper}, true)`;
      if (tenantId) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return fn(tx);
    });
  }
}
