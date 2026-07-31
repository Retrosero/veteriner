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
        path: "/api/v1/owners?query=demo&limit=20",
        requiresAuth: true,
      },
      {
        name: "search_patients",
        method: "GET",
        path: "/api/v1/patients?query=demo&limit=20",
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
        path: "/api/v1/appointments?date=today&limit=50",
        requiresAuth: true,
      },
      {
        name: "list_appointments_week",
        method: "GET",
        path: "/api/v1/appointments?date=this_week&limit=100",
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
        path: "/api/v1/patients/{patientId}/timeline?limit=50",
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
        path: "/api/v1/catalog/products?query=&limit=50",
        requiresAuth: true,
      },
      {
        name: "list_stock",
        method: "GET",
        path: "/api/v1/inventory/stock?limit=50",
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
        path: "/api/v1/clinic/sales",
        requiresAuth: true,
        body: { items: [], branchId: "{branchId}" },
      },
      {
        name: "add_item",
        method: "POST",
        path: "/api/v1/clinic/sales/{saleId}/items",
        requiresAuth: true,
        body: { productId: "{productId}", quantity: 1 },
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
        path: "/api/v1/finance/reports/daily?date=today",
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
}

export const PROFILE_SHAPES: Record<LoadProfile, ProfileShape> = {
  smoke: { vus: 1, duration: "30s", description: "Tek VU, 30sn — saglik kontrolu" },
  pilot: { vus: 10, duration: "2m", description: "10 VU, 2dk — pilot dogrulama" },
  first_100: {
    vus: 50,
    duration: "5m",
    description: "50 VU, 5dk — ilk 100 tenant hedefi",
  },
  stress: {
    vus: 200,
    duration: "5m",
    description: "200 VU, 5dk — darbogaz tespiti",
  },
};

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
