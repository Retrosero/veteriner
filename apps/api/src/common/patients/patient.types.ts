/**
 * @file Patient (hayvan) domain tipleri.
 * @module apps/api/common/patients/patient.types
 *
 * @description GOAL-021 hasta (hayvan) kayıt ve arama domain modeli.
 * Multi-tenant bir ortamda hasta sahibine bağlı hayvan kaydını temsil
 * eder. Klinik kayıtlar append-only / versiyonlanır; burada yer alan
 * `Patient` ise kimlik/özellik kaydıdır (muayene, aşı vb. ayrı
 * entity'lerdir).
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

/** Desteklenen hayvan türü. Pilot kapsamında `other` aktif değildir. */
export type Species = "dog" | "cat" | "bird" | "other";

/** Cinsiyet. `unknown` doğumda belirlenemeyen durumlar içindir. */
export type Gender = "male" | "female" | "unknown";

/**
 * Yeni hasta kaydı oluşturma girdisi. `ownerId` zorunludur; service
 * katmanı owner'ın aynı tenant'ta olduğunu doğrular.
 */
export interface PatientCreateInput {
  /** Bağlı olduğu owner ID. */
  ownerId: string;
  /** Hayvanın adı (ör. "Boncuk"). */
  name: string;
  /** Tür. TR pilot whitelist ile sınırlandırılır. */
  species: Species;
  /** Irk (ör. "Golden Retriever"). Opsiyonel. */
  breed?: string | undefined;
  /** Doğum tarihi ISO `YYYY-MM-DD`. Opsiyonel. */
  birthDate?: string | undefined;
  /** Cinsiyet. */
  gender: Gender;
  /** 15 haneli mikroçip numarası. Opsiyonel. */
  microchip?: string | undefined;
  /** Renk / görünüş. Opsiyonel. */
  color?: string | undefined;
  /** Kısırlaştırılmış mı. */
  neutered: boolean;
  /** Serbest not. Opsiyonel. */
  notes?: string | undefined;
}

/** Tenant-scoped arama filtreleri. */
export interface PatientFilters {
  /** Owner ID filtresi. */
  ownerId?: string | undefined;
  /** Tür filtresi. */
  species?: Species | undefined;
  /**
   * Serbest arama; ad / ırk / mikroçip üzerinde case-insensitive
   * substring match yapılır.
   */
  search?: string | undefined;
  /** Sayfa boyutu. */
  limit: number;
  /** Sayfa başlangıcı. */
  offset: number;
}

/** Persist edilmiş hasta. */
export interface Patient {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  species: Species;
  breed: string | null;
  birthDate: string | null;
  gender: Gender;
  microchip: string | null;
  color: string | null;
  neutered: boolean;
  notes: string | null;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC; null = aktif kayıt. */
  archivedAt: string | null;
}

/**
 * TR pilot kapsamında desteklenen türler. `other` henüz aktif
 * değildir (Faz 14+ ile büyütülecek). Genişletme için ülke
 * adaptörüne `isSpeciesAllowed(species)` eklenebilir; şimdilik
 * TR sabit olarak uygulanır.
 */
export const TR_ALLOWED_SPECIES: ReadonlyArray<Species> = [
  "dog",
  "cat",
  "bird",
];

/** ISO `YYYY-MM-DD` formatı için temel regex. */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** 15 haneli mikroçip formatı (ISO 11784/11785). */
export const MICROCHIP_REGEX = /^\d{15}$/;
