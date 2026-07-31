/**
 * @file Pilot kabul (UAT) test altyapisi giris modulu.
 * @module @vetniva/acceptance-test
 *
 * @description GOAL-121 (FAZ-12) pilot kabul testi altyapisi.
 * 10 uctan uca pilot senaryosu (yeni musteri/hayvan, randevu,
 * muayene, asi, petshop, tahsilat, ameliyat, yatis, lab,
 * portal) icin sirali API calistirici, sure/hata/yorum
 * kayit motoru ve Markdown/JSON rapor ureticisi saglar.
 *
 * Akis:
 *   1. config.ts   — 10 senaryo katalogu
 *   2. runner.ts   — sirali HTTP, placeholder cozumu, sure/hata
 *   3. feedback.ts — pilot yorumu sema + PII mask
 *   4. report.ts   — Markdown + JSON rapor
 *   5. cli-run.ts  — tek senaryo veya tumu calistir
 *   6. cli-report.ts — JSON sonucu rapora cevir
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

export type {
  UatScenarioKey,
  HttpMethod,
  UatStep,
  UatFeedback,
  UatScenarioConfig,
  UatStepResult,
  UatScenarioResult,
  UatRunResult,
  PlaceholderContext,
} from "./types.js";

export {
  SCENARIOS,
  getScenario,
  listScenarioKeys,
  scenariosByPriority,
} from "./config.js";

export {
  runScenario,
  resolvePlaceholders,
  resolveDeep,
  readField,
  isTruthyField,
  extractIds,
  statusMatches,
  defaultFetch,
  buildAuthHeaders,
  PLACEHOLDER_SELF_REF,
  PLACEHOLDER_NOT_FOUND,
} from "./runner.js";
export type { UatFetch, UatAuthContext, RunScenarioOptions } from "./runner.js";

export {
  buildFeedback,
  applyFeedback,
  averageRating,
  unnecessaryCount,
  maskPii,
  isValidRating,
  FEEDBACK_PII_MASKED,
  FEEDBACK_INVALID_RATING,
  FEEDBACK_MISSING_REVIEWER,
} from "./feedback.js";

export {
  buildReport,
  reportToMarkdown,
  reportToJson,
  summarize,
  formatDuration,
  formatTimestamp,
} from "./report.js";
export type { ReportSummary, ReportInput } from "./report.js";
