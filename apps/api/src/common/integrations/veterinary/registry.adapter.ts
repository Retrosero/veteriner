/**
 * @file Resmî veteriner sistemleri adapter arayüzü.
 * @module apps/api/common/integrations/veterinary/registry.adapter
 *
 * @description GOAL-134 (FAZ-13) Türkiye'deki resmî veteriner
 * sistemlerine veri aktarımı için adapter sözleşmesi:
 * - **Türkvet** (T.C. Tarım ve Orman Bakanlığı, Gıda ve
 *   Kontrol Genel Müdürlüğü): kedi/köpek aşı + mikroçip
 *   kayıtları, sahiplik bilgisi.
 * - **PETVET** (Türk Veteriner Hekimleri Birliği): muayene
 *   + tedavi kayıtları (opsiyonel).
 * - **İl/İlçe Tarım Müdürlükleri** (yerel API'ler).
 *
 * **Önemli:** Tüm aktarımlar yasal düzenlemelere (5996
 * sayılı Kanun + Kedi/Köpek Kimliklendirme Yönetmeliği)
 * uygun olmalı; batch upload + signed audit log.
 *
 * @since GOAL-134 (FAZ-13) resmî veteriner adapter
 */

import type { ActorContext } from "../../actor/actor-context.service.js";

/** Veteriner sistemi. */
export type VeterinaryRegistry = "turkveteriner" | "petvet" | "il_tarim";

/** Kayıt türü. */
export type RegistryRecordType =
  | "vaccination"
  | "microchip"
  | "ownership"
  | "examination"
  | "death";

/** Adapter payload (ortak). */
export interface RegistryRecord {
  id: string;
  type: RegistryRecordType;
  patientMicrochip: string;
  patientSpecies: "dog" | "cat" | "bird";
  ownerFullName: string;
  ownerPhone: string;
  ownerIdentityNumber: string;
  veterinarianLicenseNumber: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

/** Adapter sonucu. */
export interface RegistrySubmitResult {
  registryId: string;
  externalId: string;
  status: "accepted" | "rejected" | "pending_review";
  message: string;
}

/** Resmî veteriner adapter sözleşmesi. */
export interface VeterinaryRegistryAdapter {
  readonly name: VeterinaryRegistry;
  /** Kayıt gönderir (batch veya single). */
  submit(
    records: RegistryRecord[],
    actor: ActorContext,
  ): Promise<RegistrySubmitResult[]>;
  /** Kayıt sorgular (external ID → status). */
  query(externalId: string): Promise<RegistrySubmitResult>;
  /** Audit metadata. */
  readonly metadata: {
    endpoint: string;
    requiresLicense: boolean;
    retentionYears: number;
  };
}

/** DI token. */
export const VETERINARY_REGISTRY_ADAPTER = Symbol("VETERINARY_REGISTRY_ADAPTER");
