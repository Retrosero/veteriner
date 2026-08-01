/**
 * @file Load test altyapisi giris modulu.
 * @module @vetniva/load-test
 *
 * @description GOAL-122 (FAZ-12) performans ve yuk testi.
 * 7 kritik senaryo (hasta arama, takvim, zaman cizelgesi,
 * stok, POS, rapor, hata merkezi) icin k6 script sablonlari,
 * threshold motoru ve rapor ureticisi saglar. Tenant izolasyonu,
 * audit ve PII kurallarina uyar.
 *
 * Akis:
 *   1. config.ts — senaryo katalogu + profil
 *   2. thresholds.ts — k6 summary -> ScenarioResult
 *   3. report.ts — Markdown/JSON rapor
 *   4. generator.ts — k6 .js script uretimi
 *   5. k6-shared.ts — k6 ortak helper sablonu
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

export type {
  ScenarioConfig,
  ScenarioKey,
  ScenarioResult,
  ScenarioStep,
  ThresholdSpec,
  ThresholdFailure,
  LoadProfile,
  LoadTestReport,
  K6Summary,
  K6MetricSummary,
  HttpMethod,
} from "./types.js";

export {
  SCENARIOS,
  LOAD_PROFILES,
  PROFILE_SHAPES,
  thresholdsForProfile,
  getScenario,
  listScenarioKeys,
  isProfileAllowed,
} from "./config.js";
export type { ProfileShape } from "./config.js";

export {
  readMetricNumber,
  extractMetrics,
  checkThreshold,
  evaluateScenario,
} from "./thresholds.js";
export type { ExtractedMetrics } from "./thresholds.js";

export { buildReport, reportToMarkdown, reportToJson } from "./report.js";
export type { ReportInput } from "./report.js";

export { K6_SHARED_TEMPLATE, k6Options } from "./k6-shared.js";

export {
  generateScenarioScript,
  writeAllScripts,
  listJsFiles,
} from "./generator.js";
