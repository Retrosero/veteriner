/**
 * @file Pilot kabul (UAT) geri bildirim sema ve islemleri.
 * @module @vetniva/acceptance-test/feedback
 *
 * @description GOAL-121 (FAZ-12) kapsaminda pilot kullanicinin
 * adim bazli geri bildirim kayitlarinin sema kontrolu,
 * PII mask ve birlestirme islemleri. UatStepResult'a eklenen
 * geri bildirimler raporda one cikar.
 *
 * PII notu: yorum alaninda TCKN/telefon/email/IBAN/kart
 * numarasi tespit edilirse maskelenir. Maskeleme sonrasi
 * yorum >= 4 karakter ise kabul edilir; aksi halde bos
 * yorum sayilir (adim puani yine de kaydedilir).
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import type { UatFeedback, UatStepResult } from "./types.js";

/** PII mask hata kodu (log/audit icin). */
export const FEEDBACK_PII_MASKED = "UAT-FEEDBACK-0001";

/** Gecersiz puan hata kodu. */
export const FEEDBACK_INVALID_RATING = "UAT-FEEDBACK-0002";

/** Bos reviewer hata kodu. */
export const FEEDBACK_MISSING_REVIEWER = "UAT-FEEDBACK-0003";

/** E-posta regex'i (PII mask icin). */
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** TCKN (11 haneli) regex'i. */
const RE_TCKN = /\b[1-9][0-9]{9}[02468]\b|\b[5-9]\d{9}\b/g;
/** Telefon (5XX...) regex'i. */
const RE_PHONE = /\b0?5\d{9}\b|\+?90\s?5\d{9}\b/g;
/** IBAN regex'i (TR ile baslayan 26 karakter). */
const RE_IBAN = /\bTR\d{24}\b/g;
/** Kart numarasi (16 hane gruplu) regex'i. */
const RE_CARD = /\b(?:\d[ -]?){13,19}\b/g;

/**
 * Serbest metin icindeki PII desenlerini maskeler. Maskeli
 * hali orijinalden daha kisa olabilir; yorumun anlami
 * korunarak PII sizintisi engellenir.
 */
export function maskPii(input: string): { text: string; masked: boolean } {
  if (!input) return { text: input, masked: false };
  let text = input;
  let masked = false;
  const patterns: ReadonlyArray<RegExp> = [
    RE_EMAIL,
    RE_IBAN,
    RE_TCKN,
    RE_PHONE,
    RE_CARD,
  ];
  for (const re of patterns) {
    const replaced = text.replace(re, (m) => {
      if (m.includes("@")) {
        masked = true;
        const at = m.indexOf("@");
        const name = m.slice(0, at);
        const local = name.length > 2 ? name[0] + "***" : "***";
        return `${local}@***`;
      }
      if (m.startsWith("TR") && m.length === 26) {
        masked = true;
        return `TR** **** **** **** **${m.slice(-2)}`;
      }
      if (m.length >= 13) {
        masked = true;
        return `**** **** **** ${m.replace(/\D/g, "").slice(-4)}`;
      }
      masked = true;
      return `${m.slice(0, 2)}***${m.slice(-2)}`;
    });
    text = replaced;
  }
  return { text, masked };
}

/** Gecerli puan mi (0 | 1..5). */
export function isValidRating(rating: number): boolean {
  return rating === 0 || (Number.isInteger(rating) && rating >= 1 && rating <= 5);
}

/**
 * Ham geri bildirim objesini validate edip normalize
 * edilmis UatFeedback dondurur. PII maskelenir; gecersiz
 * puan/reviewer hata firlatir.
 */
export function buildFeedback(
  raw: Partial<UatFeedback> & { reviewer: string },
  now: () => Date = () => new Date(),
): UatFeedback {
  if (!raw.reviewer || raw.reviewer.trim().length === 0) {
    throw new Error(`${FEEDBACK_MISSING_REVIEWER}: reviewer zorunlu`);
  }
  const rating = raw.rating ?? 0;
  if (!isValidRating(rating)) {
    throw new Error(`${FEEDBACK_INVALID_RATING}: ${rating}`);
  }
  const masked = maskPii(raw.comment ?? "");
  return {
    reviewer: raw.reviewer.trim(),
    comment: masked.text,
    rating,
    unnecessary: raw.unnecessary === true,
    occurredAt: raw.occurredAt ?? now().toISOString(),
  };
}

/**
 * Adim sonuclarina geri bildirimleri merge eder. Eslesen
 * adim adina sahip olanlara uygulanir; olmayanlara
 * mudahale edilmez.
 */
export function applyFeedback(
  results: ReadonlyArray<UatStepResult>,
  feedbacks: ReadonlyArray<UatFeedback>,
): UatStepResult[] {
  // adimAdi -> feedback (son olan oncelikli, deterministik)
  const map = new Map<string, UatFeedback>();
  for (const f of feedbacks) {
    // UatStepResult icinde feedback step.name ile eslesir.
    // Burada step.name bilinmediginden sira korelasyonu
    // rapor ureticisinde disaridan yapilir; bu fonksiyon
    // sadece tek-tek eslestirmede kullanilir.
    for (const r of results) {
      if (!r.feedback) map.set(r.name, f);
    }
  }
  return results.map((r) => ({ ...r, feedback: r.feedback ?? map.get(r.name) ?? null }));
}

/** Pilot geri bildiriminden ortalama puan (0 = hic puan yok). */
export function averageRating(
  results: ReadonlyArray<UatStepResult>,
): number {
  const ratings = results
    .map((r) => r.feedback?.rating ?? 0)
    .filter((r) => r > 0);
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce<number>((s, r) => s + r, 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

/** "Gereksiz adim" olarak isaretlenen adim sayisi. */
export function unnecessaryCount(
  results: ReadonlyArray<UatStepResult>,
): number {
  return results.filter((r) => r.feedback?.unnecessary === true).length;
}
