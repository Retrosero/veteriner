/**
 * @file Alert (klinik uyarı) domain tipleri.
 * @module apps/api/common/alerts/alert.types
 *
 * @description GOAL-023 alerji, kronik durum, ilaç etkileşimi ve
 * davranış uyarıları için domain tipleri. In-memory Map'te
 * tutulur; production'a geçişte Prisma `PatientAlert` tablosu
 * ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Uyarı kategorileri:
 * - `allergy`: bilinen alerji (penisilin, gıda, vb.).
 * - `chronic_condition`: diyabet, böbrek yetmezliği, vb.
 * - `medication_conflict`: reçeteyle çakışan bilinen durum.
 * - `behavior`: agresyon, anksiyete, vb. (muayene sırası dikkat).
 *
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
 */

import type {
  Alert,
  AlertCreateInput,
  AlertSeverity,
} from "@vetniva/contracts";

/** Yeni uyarı oluşturma girdisi. `patientId` service katmanında
 *  parametre olarak gelir; burada yoktur. */
export type AlertInput = AlertCreateInput;

/** Persist edilmiş uyarı. `Alert` sözleşmesi ile aynı. */
export type AlertRecord = Alert;

/** Tenant-scoped arama filtreleri. */
export interface AlertFilters {
  /** Severity filtresi. */
  severity?: AlertSeverity | undefined;
  /** Yalnızca aktif kayıtlar (archivedAt null && expiresAt>now
   *  veya null). */
  activeOnly?: boolean | undefined;
}
