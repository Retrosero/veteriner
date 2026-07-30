/**
 * @file Waitlist (bekleme listesi) domain tipleri.
 * @module apps/api/modules/waitlist/waitlist.types
 *
 * @description GOAL-032 bekleme listesi domain modeli. Resepsiyon
 * akışı sırasında oluşturulan "sıra kaydı"dır; slot açıldığında
 * randevuya dönüştürülür. In-memory Map'te tutulur; production'a
 * geçişte Prisma `WaitlistEntry` tablosu ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * Bekleme listesi kimlik düzeyindedir (patient + tarih + öncelik);
 * klinik kayıt (muayene, aşı vb.) append-only / versiyonlanır ve
 * appointment'a foreign key ile bağlanır (FAZ-3 ileriki goal'lar).
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import type {
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistFilters,
  WaitlistPriority,
  WaitlistStatus,
} from "@vetniva/contracts";

export type {
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistFilters,
  WaitlistPriority,
  WaitlistStatus,
};

/** Bekleme listesi kaydının varsayılan geçerlilik süresi (gün). */
export const WAITLIST_DEFAULT_TTL_DAYS = 30;
