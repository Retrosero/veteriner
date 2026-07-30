/**
 * @file Branch service.
 * @module apps/api/modules/branch/branch.service
 *
 * @description Branch iş kuralları. Repository üzerinden veri
 * erişimi sağlar; permission kontrolü, audit event yayını, hata
 * yönetimi burada yapılır.
 *
 * İş kuralları:
 * - Branch listeleme: tenant kullanıcısı yalnızca kendi tenant'ının
 *   branch'larını görür (RLS).
 * - Branch oluşturma: SUPERADMIN veya tenant OWNER.
 * - Branch güncelleme: SUPERADMIN veya tenant OWNER.
 * - Branch arşivleme: SUPERADMIN veya tenant OWNER; arşivlenen
 *   branch'in FK'si olan kayıtlar korunur.
 *
 * @security RLS actor.tenantId üzerinden filtreyi uygular.
 *   Service katmanı ek olarak OWNER veya SUPERADMIN rolü kontrol eder.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable, Logger } from "@nestjs/common";

import { AuditService } from "../../common/audit/audit.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  ArchiveBranchRequest,
  BranchListResponse,
  BranchResponse,
  CreateBranchRequest,
  UpdateBranchRequest,
} from "@vetniva/contracts";

import { toBranchResponse } from "./dto/branch.dto.js";
import {
  BranchRepository,
  type ListBranchesArgs,
} from "./branch.repository.js";

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  public constructor(
    private readonly repo: BranchRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Bir tenant'ın branch'lerini listeler. RLS actor.tenantId üzerinden
   * filtreyi uygular.
   */
  public async list(
    args: ListBranchesArgs & { actor: ActorContext },
  ): Promise<BranchListResponse> {
    const { actor, ...listArgs } = args;
    this.requireReadScope(actor, listArgs.tenantId);
    const branches = await this.repo.list(listArgs, this.repoActor(actor));
    return {
      items: branches.map(toBranchResponse),
      total: branches.length,
    };
  }

  /**
   * Branch detayı. Cross-tenant denemesi → 404.
   */
  public async findById(
    id: string,
    actor: ActorContext,
  ): Promise<BranchResponse> {
    const branch = await this.repo.findById(id, this.repoActor(actor));
    if (!branch) {
      throw new DomainError({
        errorCode: "VET-BRANCH-0001",
        message: "Şube bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0001",
      });
    }
    this.enforceReadScope(actor, branch.tenantId);
    return toBranchResponse(branch);
  }

  /**
   * Yeni branch oluşturur. SUPERADMIN veya tenant OWNER.
   */
  public async create(
    tenantId: string,
    input: CreateBranchRequest,
    actor: ActorContext,
  ): Promise<BranchResponse> {
    this.requireWriteScope(actor, tenantId);

    const codeTaken = await this.repo.existsByCode(tenantId, input.code);
    if (codeTaken) {
      throw new DomainError({
        errorCode: "VET-BRANCH-0003",
        message: "Bu şube kodu zaten kayıtlı",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0003",
        details: { tenantId, code: input.code },
      });
    }

    const branch = await this.repo.create(
      {
        tenantId,
        code: input.code,
        name: input.name,
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
      this.repoActor(actor),
    );

    await this.audit.record({
      eventName: "audit:branch.create",
      tenantId: branch.tenantId,
      branchId: branch.id,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "branch",
      targetId: branch.id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        code: branch.code,
        name: branch.name,
        city: branch.city,
        status: branch.status,
      },
      metadata: { tenantId, source: actor.source },
    });

    return toBranchResponse(branch);
  }

  /**
   * Branch günceller. SUPERADMIN veya tenant OWNER.
   */
  public async update(
    id: string,
    input: UpdateBranchRequest,
    actor: ActorContext,
  ): Promise<BranchResponse> {
    const existing = await this.repo.findById(id, this.repoActor(actor));
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-BRANCH-0001",
        message: "Şube bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0001",
      });
    }
    this.requireWriteScope(actor, existing.tenantId);

    const data: Parameters<BranchRepository["update"]>[1] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.city !== undefined) data.city = input.city;
    if (input.address !== undefined) {
      data.addressJson = input.address as unknown as Parameters<
        BranchRepository["update"]
      >[1] extends infer R
        ? R extends { addressJson?: infer A }
          ? A
          : never
        : never;
    }
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.status !== undefined) data.status = input.status;

    const updated = await this.repo.update(id, data, this.repoActor(actor));

    await this.audit.record({
      eventName: "audit:branch.update",
      tenantId: updated.tenantId,
      branchId: updated.id,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "branch",
      targetId: updated.id,
      action: "update",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { name: existing.name, status: existing.status },
      after: { name: updated.name, status: updated.status },
      diff: this.diffFields(existing, updated, [
        "name",
        "city",
        "phone",
        "status",
      ]),
    });

    return toBranchResponse(updated);
  }

  /**
   * Branch'i arşivler (soft delete). SUPERADMIN veya tenant OWNER.
   */
  public async archive(
    id: string,
    input: ArchiveBranchRequest,
    actor: ActorContext,
  ): Promise<BranchResponse> {
    const existing = await this.repo.findById(id, this.repoActor(actor));
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-BRANCH-0001",
        message: "Şube bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0001",
      });
    }
    this.requireWriteScope(actor, existing.tenantId);
    if (existing.status === "closed") {
      throw new DomainError({
        errorCode: "VET-BRANCH-0004",
        message: "Şube zaten kapatılmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-BRANCH-0004",
      });
    }
    const archived = await this.repo.archive(id, this.repoActor(actor));

    await this.audit.record({
      eventName: "audit:branch.update",
      tenantId: archived.tenantId,
      branchId: archived.id,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "branch",
      targetId: archived.id,
      action: "archive",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { status: existing.status, archivedAt: null },
      after: { status: archived.status, archivedAt: archived.archivedAt },
      metadata: { reason: input?.reason ?? null },
    });

    return toBranchResponse(archived);
  }

  /**
   * Repository'e aktarılacak actor bilgisi.
   */
  private repoActor(actor: ActorContext): {
    tenantId: string | null;
    isSuperadmin: boolean;
  } {
    return {
      tenantId: actor.tenantId,
      isSuperadmin: actor.role === "SUPERADMIN",
    };
  }

  /**
   * Okuma kapsamı: SUPERADMIN veya kendi tenant.
   */
  private requireReadScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-BRANCH-0001",
      message: "Şube bulunamadı",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-BRANCH-0001",
    });
  }

  private enforceReadScope(actor: ActorContext, tenantId: string): void {
    this.requireReadScope(actor, tenantId);
  }

  /**
   * Yazma kapsamı: SUPERADMIN veya kendi tenant OWNER.
   */
  private requireWriteScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.role === "OWNER" && actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

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
