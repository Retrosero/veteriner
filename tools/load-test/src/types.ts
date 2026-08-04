/**
 * @file Load test temel tipleri.
 * @module @vetniva/load-test/types
 *
 * @description k6 yuk testi sonuclarini temsil eden vektorler,
 * senaryo tanimlari, threshold yapisi ve rapor veri modelini
 * icerir. Hem k6 JSON cikti ayristiricilari hem de TypeScript
 * tarafindaki config dogrulayicilari tarafindan paylasilir.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

/** Kritik senaryo tanimlari (7 adet). */
export type ScenarioKey =
  | "patient_search"
  | "calendar"
  | "patient_timeline"
  | "stock_query"
  | "pos"
  | "report"
  | "error_center";

/** HTTP metodu. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** K6 yuk profili. */
export type LoadProfile =
  | "smoke" // 1 VU, 30sn
  | "pilot" // 10 VU, 2dk
  | "first_100" // 50 VU, 5dk (hedef)
  | "stress"; // 200 VU, 5dk (darbogaz tespiti)

/** Tek bir senaryo icin yuk testi konfigurasyonu. */
export interface ScenarioConfig {
  /** Senaryo anahtari. */
  key: ScenarioKey;
  /** Insan okur baslik. */
  title: string;
  /** Aciklama (ne olculuyor). */
  description: string;
  /** Test edilecek API route'lari. */
  steps: ReadonlyArray<ScenarioStep>;
  /** Esik degerleri. */
  thresholds: ThresholdSpec;
  /** Onerilen yuk profilleri. */
  recommendedProfiles: ReadonlyArray<LoadProfile>;
  /**
   * Ramp-up suresi (k6 stages icin). Bos veya undefined = profil
   * varsayilanina dus (k6 sabit VU). k6 suresi string ("30s").
   */
  warmupSec?: string;
  /**
   * Cool-down suresi (k6 stages icin). Bos veya undefined = profil
   * varsayilanina dus (k6 sabit VU). k6 suresi string ("30s").
   */
  cooldownSec?: string;
}

/** Tek bir API cagrisi (adim). */
export interface ScenarioStep {
  name: string;
  method: HttpMethod;
  /** Ornek: "/api/v1/patients?query=demo". */
  path: string;
  /**
   * Eger adim auth gerektiriyorsa true; auth k6 tarafinda
   * shared.js icinden halledilir. Idempotent adimlarda true.
   */
  requiresAuth: boolean;
  /** Govde (sadece POST/PUT/PATCH icin). */
  body?: unknown;
  /** Adima ozel ek header'lar. */
  headers?: Record<string, string>;
}

/** Threshold tanimi (p95 latency, hata orani, throughput). */
export interface ThresholdSpec {
  /** p95 latency ust siniri (ms). */
  p95Ms: number;
  /** p99 latency ust sinuri (ms); null = kontrol yok. */
  p99Ms: number | null;
  /** HTTP hata orani ust siniri (0-1). */
  maxErrorRate: number;
  /** Minimum saniyedeki istek (RPS); null = kontrol yok. */
  minRps: number | null;
}

/** k6 tarafindan uretilen ozet metrik. */
export interface K6MetricSummary {
  name: string;
  /** k6 "value" alani (genelde sayi; null = sample yok). */
  value: number | null;
  /** k6 "passes" / "fails" sadece threshold check'lerinde. */
  thresholds?: ReadonlyArray<{ source: string; ok: boolean }>;
  /** k6 summary-export percentile/count/rate alanlari (k6 v2 dahil). */
  [key: string]: unknown;
}

/** k6 summary JSON ciktisinin bizim icin lazim olan parcasi. */
export interface K6Summary {
  /** Root level metrics. */
  metrics: Record<string, K6MetricSummary>;
  /** Root level root_group (opsiyonel). */
  root_group?: unknown;
}

/** Senaryo sonucu (threshold karsilastirmasi). */
export interface ScenarioResult {
  scenario: ScenarioKey;
  title: string;
  profile: LoadProfile;
  /** Orneklenen p95 latency. */
  p95Ms: number | null;
  /** Orneklenen p99 latency. */
  p99Ms: number | null;
  /** HTTP hata orani. */
  errorRate: number;
  /** Saniyedeki istek sayisi. */
  rps: number;
  /** Threshold sonucu. */
  passed: boolean;
  /** Basarisiz threshold'lar (detay). */
  failures: ReadonlyArray<ThresholdFailure>;
}

/** Threshold ihlal detayi. */
export interface ThresholdFailure {
  metric: "p95" | "p99" | "error_rate" | "rps";
  expected: string;
  actual: number | null;
  reason: string;
}

/** Tum senaryolarin toplu sonucu. */
export interface LoadTestReport {
  /** Calistirilma zamani (ISO). */
  runAt: string;
  /** Kullanilan profil. */
  profile: LoadProfile;
  /** API base URL. */
  baseUrl: string;
  /** Senaryo sonuclari. */
  scenarios: ReadonlyArray<ScenarioResult>;
  /** Genel gecme durumu (tum senaryolar gectiyse true). */
  allPassed: boolean;
  /** Gecen senaryo sayisi. */
  passedCount: number;
  /** Kalan senaryo sayisi. */
  failedCount: number;
}
