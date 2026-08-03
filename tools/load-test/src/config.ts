/**
 * @file Yuk testi konfigurasyonu ve senaryo katalogu.
 * @module @vetniva/load-test/config
 *
 * @description GOAL-122 (FAZ-12) kapsaminda pilot ve ilk
 * 100 tenant olcegi icin 7 kritik senaryo tanimlanir. Her
 * senaryo API route, threshold ve onerilen yuk profili tasir.
 * Tenant izolasyonu, audit ve PII kurallarina uyulur; test
 * verisi kimliksiz placeholder kullanir.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import type {
  LoadProfile,
  ScenarioConfig,
  ScenarioKey,
  ThresholdSpec,
} from "./types.js";

/** Pilot/ilk 100 tenant icin varsayilan threshold. */
const PILOT_THRESHOLDS: ThresholdSpec = {
  p95Ms: 500,
  p99Ms: 1000,
  maxErrorRate: 0.01, // %1
  minRps: 10,
};

/** Darbogaz tespiti icin (stress profili). */
const STRESS_THRESHOLDS: ThresholdSpec = {
  p95Ms: 1500,
  p99Ms: 3000,
  maxErrorRate: 0.05, // %5
  minRps: 50,
};

/**
 * Profil adina gore threshold dondurur. Bilinmeyen profil
 * icin pilot threshold kullanilir (guvenli varsayilan).
 */
export function thresholdsForProfile(profile: LoadProfile): ThresholdSpec {
  if (profile === "stress") return STRESS_THRESHOLDS;
  if (profile === "smoke") {
    return {
      p95Ms: 300,
      p99Ms: 600,
      maxErrorRate: 0,
      minRps: 1,
    };
  }
  return PILOT_THRESHOLDS;
}

/**
 * Ortam degiskenleri ile threshold override.
 *
 * GOAL-122 (FAZ-12) geregi production / pilot esik degerleri
 * ortam uzerinden asagidaki oncelikle override edilir:
 *   1. Senaryo + profil adina ozel env: LOAD_TEST_P95_MS_<KEY>_<PROFILE>
 *      (ornek: LOAD_TEST_P95_MS_PATIENT_SEARCH_PILOT=600)
 *   2. Profil bazli env: LOAD_TEST_P95_MS_PILOT=550
 *   3. Genel env: LOAD_TEST_P95_MS=500
 *   4. Profil varsayilani
 *
 * maxErrorRate 0-1 orani olarak beklenir; 0..1 araliginda
 * parse edilir. minRps negatifse null kabul edilir.
 *
 * Guvenlik: env degerleri Number(...) ile parse edilir;
 * NaN/Infinity durumunda override uygulanmaz, profil
 * varsayilani korunur. Bu sayede operator hatali env
 * degeri ile sessiz sansur uretmez.
 */
export interface EnvOverride {
  profile: LoadProfile;
  scenarioKey?: ScenarioKey;
  env?: NodeJS.ProcessEnv;
}

export function applyThresholdEnvOverrides(
  base: ThresholdSpec,
  ovr: EnvOverride,
): ThresholdSpec {
  const env = ovr.env ?? process.env;
  const pfx = buildPrefix(ovr);

  // p95Ms (>=0)
  const p95 = readNumber(env[`${pfx}_P95_MS`]);
  // p99Ms (>=0 veya "null" string)
  const p99Raw = env[`${pfx}_P99_MS`];
  let p99: number | null = base.p99Ms;
  if (p99Raw !== undefined) {
    if (p99Raw === "null" || p99Raw === "") {
      p99 = null;
    } else {
      const v = Number(p99Raw);
      if (Number.isFinite(v) && v >= 0) p99 = v;
    }
  }
  // maxErrorRate (0-1) — yuzdelik 0-100 olarak da kabul edilir;
  // 1'den buyukse yuzdelik olarak yorumlanir.
  let maxErr = base.maxErrorRate;
  const maxErrRaw = env[`${pfx}_MAX_ERROR_RATE`];
  if (maxErrRaw !== undefined) {
    const v = Number(maxErrRaw);
    if (Number.isFinite(v) && v >= 0) {
      maxErr = v > 1 ? v / 100 : v;
    }
  }
  // minRps (>=0 veya "null")
  let minRps: number | null = base.minRps;
  const minRpsRaw = env[`${pfx}_MIN_RPS`];
  if (minRpsRaw !== undefined) {
    if (minRpsRaw === "null" || minRpsRaw === "") {
      minRps = null;
    } else {
      const v = Number(minRpsRaw);
      if (Number.isFinite(v) && v >= 0) minRps = v;
    }
  }

  return {
    p95Ms: p95 ?? base.p95Ms,
    p99Ms: p99,
    maxErrorRate: maxErr,
    minRps,
  };
}

/** Env anahtar on ekini uretir. */
function buildPrefix(ovr: EnvOverride): string {
  const profile = ovr.profile.toUpperCase();
  if (ovr.scenarioKey) {
    return `LOAD_TEST_${ovr.scenarioKey.toUpperCase()}_${profile}`;
  }
  return `LOAD_TEST_${profile}`;
}

/** Env stringini sayiya cevirir; gecersizse undefined. */
function readNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/**
 * 7 kritik senaryo katalogu. Sirasi ile:
 *
 *  1. patient_search    — hasta sahibi/hayvan arama
 *  2. calendar          — klinik takvimi
 *  3. patient_timeline  — hayvan zaman cizelgesi
 *  4. stock_query       — stok/depo/raf sorgu
 *  5. pos               — petshop POS
 *  6. report            — temel finans/klinik rapor
 *  7. error_center      — hata merkezi listesi (superadmin)
 */
export const SCENARIOS: ReadonlyArray<ScenarioConfig> = [
  {
    key: "patient_search",
    title: "Hasta arama",
    description:
      "Hasta sahibi / hayvan arama endpoint'i; kucuk/orta olcekli klinikte en sik cagrilan uctan uca okuma yolu.",
    steps: [
      {
        name: "search_owners",
        method: "GET",
        path: "/api/v1/clinic/owners?search=demo&limit=20",
        requiresAuth: true,
      },
      {
        name: "search_patients",
        method: "GET",
        path: "/api/v1/clinic/patients?search=demo&limit=20",
        requiresAuth: true,
      },
    ],
    thresholds: PILOT_THRESHOLDS,
    recommendedProfiles: ["smoke", "pilot", "first_100", "stress"],
  },
  {
    key: "calendar",
    title: "Klinik takvimi",
    description:
      "Randevu takvimi listeleme; gunluk kullanimin yogun oldugu ana ekran. Tarih araligi ile gunluk gorunum.",
    steps: [
      {
        name: "list_appointments_today",
        method: "GET",
        path: "/api/v1/calendar/days/{calendarDate}",
        requiresAuth: true,
      },
      {
        name: "list_appointments_week",
        method: "GET",
        path: "/api/v1/calendar/days/{calendarDate}?veterinarianId={veterinarianId}",
        requiresAuth: true,
      },
    ],
    thresholds: PILOT_THRESHOLDS,
    recommendedProfiles: ["smoke", "pilot", "first_100", "stress"],
  },
  {
    key: "patient_timeline",
    title: "Hayvan zaman cizelgesi",
    description:
      "Tek hayvana ait muayene, asi, lab, ameliyat, yatis kayitlari zaman cizelgesi; tenant izolasyonu kritik.",
    steps: [
      {
        name: "patient_timeline",
        method: "GET",
        path: "/api/v1/clinic/patients/{patientId}/timeline?limit=50",
        requiresAuth: true,
      },
    ],
    thresholds: {
      ...PILOT_THRESHOLDS,
      p95Ms: 600, // zaman cizelgesi join agir; biraz gevsek
    },
    recommendedProfiles: ["pilot", "first_100", "stress"],
  },
  {
    key: "stock_query",
    title: "Stok sorgusu",
    description:
      "Urun/stok/raf/lot/SKT sorgu; POS ve klinik tuketim tarafindan sik cagrilir.",
    steps: [
      {
        name: "list_products",
        method: "GET",
        path: "/api/v1/catalog/products?limit=50",
        requiresAuth: true,
      },
      {
        name: "list_stock",
        method: "GET",
        path: "/api/v1/inventory/stock-movements/balances?limit=50",
        requiresAuth: true,
      },
    ],
    thresholds: PILOT_THRESHOLDS,
    recommendedProfiles: ["pilot", "first_100", "stress"],
  },
  {
    key: "pos",
    title: "Petshop POS",
    description:
      "Sepet olusturma + urun ekleme + tahsilat taslagi; en sik yazma (write) yapan akis.",
    steps: [
      {
        name: "create_sale_draft",
        method: "POST",
        path: "/api/v1/petshop/sales",
        requiresAuth: true,
        body: {
          lines: [
            {
              productId: "{productId}",
              unit: "unit",
              quantity: "1",
              unitPrice: "100.00",
            },
          ],
          customerOwnerId: "{ownerId}",
          customerPatientId: "{patientId}",
          paymentMethod: "cash",
          paidAmount: "0",
        },
      },
    ],
    thresholds: {
      ...PILOT_THRESHOLDS,
      p95Ms: 700, // write + stok dusumu daha agir
    },
    recommendedProfiles: ["pilot", "first_100"],
  },
  {
    key: "report",
    title: "Temel finans raporu",
    description:
      "Gun sonu / kasa / tahsilat raporu; buyuk veri seti taramasi yapar.",
    steps: [
      {
        name: "daily_report",
        method: "GET",
        path: "/api/v1/reports/daily-sales?from={reportDate}&to={reportDate}",
        requiresAuth: true,
      },
    ],
    thresholds: {
      ...PILOT_THRESHOLDS,
      p95Ms: 1500, // rapor join agir; daha gevsek
      p99Ms: 3000,
      minRps: 1, // rapor sik cagrilmaz
    },
    recommendedProfiles: ["pilot", "first_100"],
  },
  {
    key: "error_center",
    title: "Hata merkezi (superadmin)",
    description:
      "Superadmin hata olaylari listesi; az kullanim ama yuk altinda gecikme kabul edilmez (alarm tetikleyici).",
    steps: [
      {
        name: "list_error_events",
        method: "GET",
        path: "/api/v1/superadmin/error-events?limit=50",
        requiresAuth: true,
      },
      {
        name: "list_security_events",
        method: "GET",
        path: "/api/v1/superadmin/security-events?limit=50",
        requiresAuth: true,
      },
    ],
    thresholds: PILOT_THRESHOLDS,
    recommendedProfiles: ["pilot", "first_100", "stress"],
  },
];

/** Senaryo anahtarindan config getirir. */
export function getScenario(key: ScenarioKey): ScenarioConfig {
  const found = SCENARIOS.find((s) => s.key === key);
  if (!found) {
    throw new Error(`Bilinmeyen senaryo: ${String(key)}`);
  }
  return found;
}

/** Tum senaryo anahtarlari. */
export function listScenarioKeys(): ReadonlyArray<ScenarioKey> {
  return SCENARIOS.map((s) => s.key);
}

/** Tum profiller. */
export const LOAD_PROFILES: ReadonlyArray<LoadProfile> = [
  "smoke",
  "pilot",
  "first_100",
  "stress",
];

/** Profil adina gore VU ve sure. */
export interface ProfileShape {
  vus: number;
  duration: string;
  description: string;
  /**
   * Default warm-up suresi (k6 stages). Senaryo kendi degerini
   * belirlemediyse kullanilir; tanimli degilse k6 sabit VU
   * modunda calisir (stages uretilmez).
   */
  defaultWarmup?: string;
  /**
   * Default cool-down suresi (k6 stages). Senaryo kendi degerini
   * belirlemediyse kullanilir.
   */
  defaultCooldown?: string;
}

export const PROFILE_SHAPES: Record<LoadProfile, ProfileShape> = {
  smoke: {
    vus: 1,
    duration: "30s",
    description: "Tek VU, 30sn — saglik kontrolu",
    defaultWarmup: "5s",
    defaultCooldown: "5s",
  },
  pilot: {
    vus: 10,
    duration: "2m",
    description: "10 VU, 2dk — pilot dogrulama",
    defaultWarmup: "15s",
    defaultCooldown: "15s",
  },
  first_100: {
    vus: 50,
    duration: "5m",
    description: "50 VU, 5dk — ilk 100 tenant hedefi",
    defaultWarmup: "30s",
    defaultCooldown: "30s",
  },
  stress: {
    vus: 200,
    duration: "5m",
    description: "200 VU, 5dk — darbogaz tespiti",
    defaultWarmup: "30s",
    defaultCooldown: "30s",
  },
};

/**
 * Senaryo + profil icin k6 options blogunda kullanilacak
 * warmup/cooldown degerlerini cozumler. Senaryo kendi degeri
 * tanimlamadiysa profil varsayilani kullanilir; profil de
 * tanimlamadiysa stages uretilmez (k6 sabit VU modunda
 * calisir — geriye donuk uyumluluk).
 */
export interface ResolvedStages {
  warmup: string | null;
  cooldown: string | null;
}

export function resolveStages(
  scenario: ScenarioConfig,
  profile: LoadProfile,
): ResolvedStages {
  const shape = PROFILE_SHAPES[profile];
  return {
    warmup: scenario.warmupSec ?? shape.defaultWarmup ?? null,
    cooldown: scenario.cooldownSec ?? shape.defaultCooldown ?? null,
  };
}

/**
 * Senaryonun profile uygunlugunu kontrol eder. Uyari olarak
 * donebilir; k6 tarafinda filtre olarak kullanilir.
 */
export function isProfileAllowed(
  scenario: ScenarioConfig,
  profile: LoadProfile,
): boolean {
  return scenario.recommendedProfiles.includes(profile);
}
