/**
 * @file Pilot geri bildirim dosyasi (JSON) okuyucu.
 * @module @vetniva/acceptance-test/feedback-loader
 *
 * @description GOAL-121 (FAZ-12) kapsaminda pilot kullanicinin
 * tarayicida (feedback-form.html) doldurdugu geri bildirimleri
 * JSON dosyadan okuyup runner'in bekledigi Map<stepName, UatFeedback>
 * formatina cevirir. PII maskelenir, gecersiz puan/reviewer hata
 * firlatir; duzeltme ozellikle (reviewer yoksa placeholder eklemez)
 * sessiz sansurden kacinilir.
 *
 * Beklenen dosya formati (feedback-form.html ile ayni):
 *
 * ```json
 * {
 *   "_meta": { "generatedAt": "ISO", "reviewer": "Dr. X" },
 *   "new_owner_patient": {
 *     "create_owner": {
 *       "reviewer": "Dr. X",
 *       "rating": 4,
 *       "comment": "Hizli",
 *       "unnecessary": false,
 *       "piiMasked": false
 *     }
 *   }
 * }
 * ```
 *
 * "scenario_key" bilinmiyorsa veya adim adinda pilot degerlendirme
 * yoksa o senaryo/adim atlanir; hata firlatilmaz (kismi geri
 * bildirim normal kabul edilir).
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { buildFeedback } from "./feedback.js";
import type { UatFeedback, UatScenarioKey } from "./types.js";

/** Bilinen senaryo anahtarlari (config.ts ile ayni). */
const KNOWN_KEYS: ReadonlySet<string> = new Set<UatScenarioKey>([
  "new_owner_patient",
  "appointment",
  "examination",
  "vaccination",
  "petshop_sale",
  "collection",
  "surgery",
  "hospitalization",
  "laboratory",
  "portal",
]);

/** Ham JSON dosyasinin beklenen yapisinin minimum parcasi. */
export interface RawFeedbackFile {
  _meta?: { generatedAt?: string; reviewer?: string; tenantLabel?: string };
  [scenarioKey: string]:
    | { [stepName: string]: Partial<UatFeedback> & { piiMasked?: boolean } }
    | { generatedAt?: string; reviewer?: string; tenantLabel?: string }
    | undefined;
}

/**
 * Ham JSON objesini scenario->step->feedback yapisinda Map'e
 * donusturur. Reviewer `_meta.reviewer`'dan miras alinir; satir
 * basina ayri reviewer verilmisse o kullanilir.
 *
 * @param raw JSON.parse edilmis obje
 * @returns senaryoKey -> stepName -> UatFeedback haritasi
 */
export function parseFeedbackJson(
  raw: RawFeedbackFile,
): Map<UatScenarioKey, Map<string, UatFeedback>> {
  const out = new Map<UatScenarioKey, Map<string, UatFeedback>>();
  const defaultReviewer = raw._meta?.reviewer;
  for (const [scenarioKey, scenarioBlock] of Object.entries(raw)) {
    if (scenarioKey === "_meta") continue;
    if (!KNOWN_KEYS.has(scenarioKey)) continue;
    if (!scenarioBlock || typeof scenarioBlock !== "object") continue;
    const stepMap = new Map<string, UatFeedback>();
    for (const [stepName, partial] of Object.entries(
      scenarioBlock as Record<string, Partial<UatFeedback>>,
    )) {
      if (!partial || typeof partial !== "object") continue;
      const fb = buildFeedback({
        reviewer: partial.reviewer ?? defaultReviewer ?? "",
        comment: partial.comment ?? "",
        rating: partial.rating ?? 0,
        unnecessary: partial.unnecessary === true,
      });
      stepMap.set(stepName, fb);
    }
    out.set(scenarioKey as UatScenarioKey, stepMap);
  }
  return out;
}

/**
 * Tek bir senaryo icin scenarioKey -> stepName -> UatFeedback
 * Map'ini flat Map<stepName, UatFeedback> formatinda doner.
 */
export function flattenForScenario(
  feedbackByScenario: ReadonlyMap<
    UatScenarioKey,
    ReadonlyMap<string, UatFeedback>
  >,
  scenarioKey: UatScenarioKey,
): ReadonlyMap<string, UatFeedback> {
  return feedbackByScenario.get(scenarioKey) ?? new Map<string, UatFeedback>();
}
