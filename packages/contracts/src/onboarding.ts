/**
 * @file Onboarding (ilk kullanim asistan) frontend/backend ortak tipleri.
 * @module @vetniva/contracts/onboarding
 *
 * @description GOAL-117 (FAZ-11) kapsaminda API'nin
 * `apps/api/src/common/onboarding/` modulu ile frontend'in
 * `apps/web/src/components/onboarding/` modulu arasindaki tek
 * dogruluk kaynagi. Bu tipler Zod ile dogrulanmaz; sadece
 * TypeScript tip guvenligi icin kullanilir (API tarafi Zod
 * semalarini zaten `onboarding.types.ts`'de tutar).
 *
 * Tibbi sorular (tani/tedavi/doz) icin `generationSource: "refusal"`
 * kullanilir; frontend bu durumu kullaniciya kibarca gosterir.
 *
 * @security PII tasimaz. Sadece sayfa yolu + aksiyon adi.
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

export type OnboardingLocale = "tr-TR" | "en-GB";

/**
 * Onboarding senaryosu kategorisi. UI tarafinda ikon + baslik
 * eslemesi icin.
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
 * Onboarding icin desteklenen roller.
 */
export type OnboardingRole =
  "SUPERADMIN" | "OWNER" | "VETERINARIAN" | "STAFF" | "PET_OWNER_PORTAL";

/**
 * Onboarding asistaninin cevap uretim kaynagi. `refusal` tibbi
 * sorularda kullanilir; UI "Bu konuda yardimci olamam" mesaji
 * gostermelidir.
 */
export type OnboardingGenerationSource = "template" | "retrieval" | "refusal";

/**
 * Onboarding tek bir adim. UI tarafi `route` uzerinden yonlendirme
 * yapar; `action` ilgili butonun adini belirtir.
 */
export interface OnboardingStep {
  order: number;
  route: string;
  title: string;
  description: string;
  action?: string;
  required_permission?: string;
  highlight?: boolean;
}

/**
 * Lokalize edilmis tek senaryo.
 */
export interface LocalizedOnboardingScenario {
  id: string;
  category: OnboardingCategory;
  module: string;
  triggers: string[];
  title: string;
  summary: string;
  steps: OnboardingStep[];
  roles: ReadonlyArray<OnboardingRole>;
  related_chunks?: string[];
  related_pages?: string[];
  related_api?: string[];
}

/**
 * Onboarding ask yanit formu.
 */
export interface OnboardingAskResponse {
  query_id: string;
  answer: string;
  generationSource: OnboardingGenerationSource;
  scenario?: LocalizedOnboardingScenario;
  alternatives?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
  duration_ms: number;
  refusalReason?:
    "medical" | "dosage" | "diagnosis" | "treatment" | "out_of_scope";
}

/**
 * Senaryo listesi yaniti.
 */
export interface OnboardingScenarioListResponse {
  role: OnboardingRole;
  scenarios: Array<{
    id: string;
    category: OnboardingCategory;
    module: string;
    title: string;
    summary: string;
    stepCount: number;
    highlight: boolean;
  }>;
  totalScenarios: number;
}
