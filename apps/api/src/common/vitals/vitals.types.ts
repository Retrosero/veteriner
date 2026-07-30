/**
 * @file Vital signs (vital bulgular) domain tipleri.
 * @module apps/api/common/vitals/vitals.types
 *
 * @description GOAL-042 muayene sırasında ölçülen vital bulgular
 * (vücut sıcaklığı, nabız, solunum, ağırlık, BCS vb.) için
 * domain modeli. Her vital kaydı bir muayeneye (examination)
 * bağlıdır ve append-only politikayla korunur; düzeltme yeni
 * vital kaydı yazımı ile yapılır (önceki kayıt üzerinde
 * UPDATE/DELETE yok).
 *
 * Vital aralıkları genel veteriner klinik aralıklarıdır
 * (kedi/köpek); ölçüm yöntemi (`temperatureMethod` vb.) audit
 * ve istatistik için tutulur.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

/** Vücut sıcaklığı ölçüm yöntemi. */
export type TemperatureMethod = "rectal" | "ear" | "axillary";

/** Mukoza rengi. */
export type MucousMembraneColor =
  | "pink"
  | "pale"
  | "cyanotic"
  | "icteric"
  | "congested";

/**
 * Ölçülen vital bulgular seti. Tüm alanlar opsiyoneldir;
 * pratikte en az bir alan (örn. `temperatureC` veya
 * `heartRateBpm`) doldurulmalıdır (service katmanı enforce
 * eder; burada zorunluluk UI esnekliği için gevşek tutulur).
 */
export interface VitalSigns {
  /** Vücut sıcaklığı °C. Genel aralık 35-42. */
  temperatureC?: number | undefined;
  /** Nabız (kalp atım hızı) BPM. Genel aralık 30-300. */
  heartRateBpm?: number | undefined;
  /** Solunum hızı BPM. Genel aralık 8-100. */
  respiratoryRateBpm?: number | undefined;
  /** Ağırlık kg. Genel aralık 0-200. */
  weightKg?: number | undefined;
  /** Vücut kondüsyon skoru (1-9). */
  bodyConditionScore?: number | undefined;
  /** Ateş ölçüm yöntemi. */
  temperatureMethod?: TemperatureMethod | undefined;
  /** Sistolik kan basıncı mmHg. Genel aralık 60-250. */
  bloodPressureSystolic?: number | undefined;
  /** Diyastolik kan basıncı mmHg. Genel aralık 40-150. */
  bloodPressureDiastolic?: number | undefined;
  /** Kapiller dolum süresi saniye (CRT). Genel aralık 0-5. */
  capillaryRefillTime?: number | undefined;
  /** Mukoza rengi. */
  mucousMembraneColor?: MucousMembraneColor | undefined;
  /** Serbest klinik not. Maks 2000 karakter. */
  notes?: string | undefined;
}

/** Yeni vital kaydı oluşturma girdisi. */
export interface VitalSignsCreateInput {
  /** Ölçülen vital bulgular. */
  vitalSigns: VitalSigns;
  /**
   * Ölçüm zamanı (opsiyonel). Belirtilmezse service katmanı
   * `new Date().toISOString()` set eder.
   */
  takenAt?: string | undefined;
}
