/**
 * @file Portal davet repository (in-memory).
 * @module apps/api/modules/portal/portal.repository
 *
 * @description GOAL-025 portal erişim daveti veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security
 * - Token dahil tüm sorgular tenantId ile filtrelenir.
 * - Token araması global (tenant-agnostic) tek map'te tutulur;
 *   tenant doğrulaması service katmanında yapılır.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

import { Injectable } from "@nestjs/common";

import type { PortalInvitation } from "../../common/portal/portal.types.js";

@Injectable()
export class PortalRepository {
  /** key: invitationId → record. */
  private readonly byId = new Map<string, PortalInvitation>();
  /** key: invitationToken → invitationId (global lookup için). */
  private readonly byToken = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `pinv-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PortalInvitation): PortalInvitation {
    this.byId.set(record.id, record);
    this.byToken.set(record.invitationToken, record.id);
    return record;
  }

  /** Tenant-scoped ID araması. */
  public findById(tenantId: string, id: string): PortalInvitation | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Token-bazlı arama (tenant doğrulaması service'te). */
  public findByToken(token: string): PortalInvitation | null {
    const id = this.byToken.get(token);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  /**
   * Tenant-agnostic ID araması. Cross-module senkronizasyon
   * (GOAL-033 PortalAuthService.markInvitationAccepted) için.
   * Service katmanı bu metodu kullanırken status guard'ı
   * uygular.
   */
  public findByIdGlobal(id: string): PortalInvitation | null {
    return this.byId.get(id) ?? null;
  }

  public update(record: PortalInvitation): PortalInvitation {
    this.byId.set(record.id, record);
    // Token değişmez; index tutarlı kalır.
    return record;
  }

  /**
   * Tenant-scoped, ownerId ile filtrelenmiş liste. Status filtresi
   * opsiyonel; tarih sırası en yeniden eskiye.
   */
  public listForOwner(
    tenantId: string,
    ownerId: string,
    statusFilter?: PortalInvitation["status"] | undefined,
  ): PortalInvitation[] {
    const all: PortalInvitation[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.ownerId !== ownerId) continue;
      if (statusFilter && rec.status !== statusFilter) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));
    return all;
  }

  /** Test yardımcısı: tüm veriyi temizler. */
  public clear(): void {
    this.byId.clear();
    this.byToken.clear();
    this.counters.clear();
  }
}
