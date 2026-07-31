/**
 * @file Onboarding (ilk kullanım asistanı) tip tanımları.
 * @module apps/api/common/onboarding/onboarding.types
 *
 * @description GOAL-117 (FAZ-11) kapsamında uygulama kullanımı
 * ve navigasyon sorularına cevap veren ilk kullanım asistanı
 * için ortak sözleşme. Teşhis/tedavi/doz önerisi VERMEZ; yalnız
 * "X sayfasına git → Y butonuna tıkla" tipi adımlar üretir.
 *
 * Örnek akış:
 * 1. Kullanıcı "Aşı kaydı nasıl yapılır?" diye sorar.
 * 2. Asistan, rolüne ve modül durumuna göre senaryo seçer.
 * 3. Adım listesi + her adım için sayfa yolu / buton döner.
 * 4. Tıbbi soru (örn. "kedime hangi aşı?") reddedilir.
 *
 * @security PII taşımaz. Sadece sayfa yolu + aksiyon adı.
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import { z } from "zod";

import type { ModuleKey } from "../modules/module.types.js";

/**
 * Desteklenen onboarding dilleri. Sistem locale ile uyumlu.
 */
export type OnboardingLocale = "tr-TR" | "en-GB";

/**
 * Onboarding senaryosu kategorisi. UI tarafında ikon + başlık
 * eşlemesi için.
 */
export type OnboardingCategory =
  | "patient_owner"
  | "appointment"
  | "clinical"
  | "vaccination"
  | "inventory"
  | "petshop"
  | "billing"
  | "laboratory"
  | "imaging"
  | "hospitalization"
  | "portal"
  | "admin";

/**
 * Lokalize edilebilen metin alanı. Statik senaryolarda
 * `{ "tr-TR": "...", "en-GB": "..." }` şeklinde tanımlanır;
 * runtime'da servis tarafından tek dile indirgenir.
 */
export interface LocalizedText {
  "tr-TR": string;
  "en-GB": string;
}

/**
 * Tek bir adım. UI tarafı `route` üzerinden yönlendirme yapar;
 * `action` ilgili butonun adını belirtir; `description` kısa
 * açıklamadır.
 */
export interface OnboardingStep {
  /** Sıra numarası (1-based). */
  order: number;
  /** Sayfa yolu (Next.js `route` pattern'i, ör.
   *  `/[locale]/clinic/patients/{patientId}/vaccinations/new`). */
  route: string;
  /** Adım başlığı (lokalize). */
  title: LocalizedText;
  /** Adım açıklaması (1-2 cümle, lokalize). */
  description: LocalizedText;
  /** Tetiklenecek aksiyon (buton). Ör. `open`, `submit`, `print`. */
  action?: string;
  /** Bu adım için gereken permission. Boşsa public. */
  required_permission?: string;
  /** Adım kritik mi? (İlk 5 dakika onboarding'de öne çıkarılır.) */
  highlight?: boolean;
}

/**
 * Onboarding senaryosu: belirli bir "X nasıl yapılır?" sorusuna
 * verilen yapılandırılmış cevap. Birden fazla senaryo dönebilir
 * (en iyi eşleşme ilk sırada).
 */
export interface OnboardingScenario {
  /** Senaryo kimliği. */
  id: string;
  /** Kategori. UI filtre ve ikon için. */
  category: OnboardingCategory;
  /** Modül (feature flag) — tenant için açık mı? */
  module: ModuleKey | "core";
  /** Soru kalıpları (küçük harf, trim). Kullanıcı sorgusu bu
   *  kalıplardan biriyle eşleşirse senaryo tetiklenir. */
  triggers: string[];
  /** Senaryo başlığı (lokalize). */
  title: LocalizedText;
  /** Senaryo kısa açıklaması (lokalize). */
  summary: LocalizedText;
  /** Adım listesi. */
  steps: OnboardingStep[];
  /** Sadece bu roller için geçerli. Boşsa tüm roller. */
  roles: ReadonlyArray<OnboardingRole>;
  /** Kaynak chunk_id'ler (opsiyonel; cross-ref için). */
  related_chunks?: string[];
  /** İlgili sayfa `page_id`'ler. */
  related_pages?: string[];
  /** İlgili API endpoint'ler. */
  related_api?: string[];
}

/**
 * Lokalize edilmiş tek adım (response payload'ı için).
 */
export interface LocalizedOnboardingStep {
  order: number;
  route: string;
  title: string;
  description: string;
  action?: string;
  required_permission?: string;
  highlight?: boolean;
}

/**
 * Lokalize edilmiş senaryo. API response'unda UI tarafına
 * düz string olarak gider; statik katalog ise
 * `OnboardingScenario` (lokalize map) tipindedir.
 */
export interface LocalizedOnboardingScenario {
  id: string;
  category: OnboardingCategory;
  module: ModuleKey | "core";
  triggers: string[];
  title: string;
  summary: string;
  steps: LocalizedOnboardingStep[];
  roles: ReadonlyArray<OnboardingRole>;
  related_chunks?: string[];
  related_pages?: string[];
  related_api?: string[];
}

/**
 * Onboarding için desteklenen roller. ActorContext ile aynı
 * isimlendirme (SHR'lerden arındırılmış).
 */
export type OnboardingRole =
  | "SUPERADMIN"
  | "OWNER"
  | "VETERINARIAN"
  | "STAFF"
  | "PET_OWNER_PORTAL";

/**
 * Ask endpoint girdi şeması (Zod).
 */
export const onboardingAskInputSchema = z.object({
  query: z.string().min(3).max(500),
  locale: z.enum(["tr-TR", "en-GB"]),
  /** Kullanıcının bulunduğu sayfa (opsiyonel; mevcut bağlam). */
  currentPage: z.string().max(256).optional(),
  /** Kullanıcının seçtiği varlık (örn. patientId). Opsiyonel. */
  selectedEntity: z.string().max(256).optional(),
  /** Tenant'ta açık modüller. Asistan buna göre senaryo süzer. */
  enabledModules: z.array(z.string()).max(20).optional(),
});
export type OnboardingAskInput = z.infer<typeof onboardingAskInputSchema>;

/**
 * Ask endpoint çıktısı.
 */
export interface OnboardingAskResponse {
  /** Soru ID (correlation). */
  query_id: string;
  /** Kullanıcıya gösterilecek kısa, tek cümlelik cevap. */
  answer: string;
  /** Üretim kaynağı (`template` | `retrieval` | `refusal`). */
  generationSource: "template" | "retrieval" | "refusal";
  /** Eşleşen senaryo (varsa, lokalize). */
  scenario?: LocalizedOnboardingScenario;
  /** Diğer aday senaryolar. */
  alternatives?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
  /** Yanıt süresi (ms). */
  duration_ms: number;
  /** Refusal durumunda neden (örn. `medical`, `dosage`,
   *  `out_of_scope`). */
  refusalReason?: OnboardingRefusalReason;
}

/**
 * Onboarding reddi nedenleri. UI tarafı bunu görsel ipucu olarak
 * kullanır (örn. "Tıbbi sorular için lütfen veteriner hekiminize
 * danışın").
 */
export type OnboardingRefusalReason =
  | "medical"
  | "dosage"
  | "diagnosis"
  | "treatment"
  | "out_of_scope";

/**
 * Senaryo listesi endpoint çıktısı.
 */
export interface OnboardingScenarioListResponse {
  /** Aktörün rolü. */
  role: OnboardingRole;
  /** Aktör için uygun senaryolar (modül filtresi uygulanmış). */
  scenarios: Array<{
    id: string;
    category: OnboardingCategory;
    module: ModuleKey | "core";
    title: string;
    summary: string;
    stepCount: number;
    highlight: boolean;
  }>;
  /** Toplam senaryo sayısı (filtrelerden önce). */
  totalScenarios: number;
}
