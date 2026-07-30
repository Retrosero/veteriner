/**
 * @file Ownership history (sahiplik geçmişi) domain tipleri.
 * @module apps/api/common/ownership/ownership.types
 *
 * @description GOAL-022 hayvan sahiplik geçmişi domain modeli.
 * Multi-tenant bir ortamda hayvan ile hasta sahibi (owner) arasındaki
 * tarihsel ilişkiyi tutar. Klinik kayıtlar append-only / versiyonlanır;
 * bu nedenle eski sahiplik kayıtları silinmez, yalnızca `endDate` set
 * edilerek "kapatılır".
 *
 * İş kuralları:
 * - Bir hayvan için aktif (endDate=null) kayıt en fazla bir tane olur.
 * - Yeni kayıt oluşturulduğunda önceki aktif kayıt `endDate`'i ile
 *   kapatılır (append-only).
 * - Her kayıt için `reason` zorunludur; "other" ise serbest metin
 *   `otherNote` ile birlikte kullanılır.
 * - Hasta arşivlendiğinde ownership kayıtları etkilenmez; identity
 *   gizleme ownership geçmişinden bağımsızdır.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import type { OwnershipReason } from "@vetniva/contracts";

/** Yeni sahiplik kaydı oluşturma girdisi. */
export interface OwnershipCreateInput {
  /** Ait olduğu tenant. */
  tenantId: string;
  /** Ait olduğu hayvan (patient) ID. */
  patientId: string;
  /** Sahip (owner) ID. */
  ownerId: string;
  /**
   * Başlangıç tarihi (ISO 8601). Verilmezse service katmanı
   * `new Date().toISOString()` ile doldurur.
   */
  startDate?: string;
  /** Değişiklik nedeni. */
  reason: OwnershipReason;
  /** `reason=other` ise serbest açıklama. */
  otherNote?: string;
  /** Transferi yapan kullanıcı ID; ilk kayıtta null olabilir. */
  createdBy?: string | null;
}

/** Tenant-scoped sorgu girdisi. */
export interface OwnershipFilters {
  patientId?: string;
  ownerId?: string;
  /** Yalnızca aktif kayıtları getir (endDate=null). */
  activeOnly?: boolean;
  limit: number;
  offset: number;
}

/** Persist edilmiş sahiplik kaydı. */
export interface Ownership {
  id: string;
  tenantId: string;
  patientId: string;
  ownerId: string;
  /** ISO 8601. */
  startDate: string;
  /** ISO 8601; null = aktif kayıt. */
  endDate: string | null;
  reason: OwnershipReason;
  otherNote: string | null;
  /** Transferi yapan kullanıcı ID; ilk kayıtta null. */
  createdBy: string | null;
  /** ISO 8601 UTC. */
  createdAt: string;
}
