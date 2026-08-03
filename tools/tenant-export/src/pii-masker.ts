/**
 * @file Tenant export icin PII masker.
 * @module @vetniva/tenant-export/pii-masker
 *
 * @description GOAL-125 (FAZ-12) tenant veri disa aktarma
 * kapsaminda PII alanlarini tespit eder ve mask'ler. apps/api
 * `PiiMasker` (FAZ-10) ile ayni PII alan katalogu kullanilir.
 *
 * Strict mod: PII alanlari mask'lenir; export icermez.
 * Permissive mod: PII alanlari olduigu gibi kalir; export
 * audit'inde flaglenir (veri sahibinin kendi verisi).
 *
 * @security Object icindeki PII alan isimleri buyuk/kucuk harf
 *   duyarsiz kontrol edilir. Nested objeler recursive mask'lenir.
 *   Dizi elemani obje ise her eleman ayri ayri mask'lenir.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import type { PiiMasker } from "./types.js";

/** PII alan isimleri (lowercase, normalized). apps/api PII_FIELDS ile ayni katalog. */
const PII_FIELDS = new Set<string>([
  // Direct identifiers (snake_case + camelCase normalized to lowercase)
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "full_name",
  "fullname",
  "email",
  "phone",
  "tax_id",
  "taxid",
  "iban",
  "passport_no",
  "passportno",
  "id_card_no",
  "idcardno",
  "address",
  "vet_license_no",
  "vetlicenseno",
  "birth_date",
  "birthdate",
  // Auth secrets
  "password",
  "current_password",
  "currentpassword",
  "new_password",
  "newpassword",
  "token",
  "refresh_token",
  "refreshtoken",
  "api_key",
  "apikey",
  "secret",
  "authorization",
  "cookie",
]);

/**
 * Standart PII masker implementasyonu. apps/api ile ayni
 * alan katalogunu kullanir; tenant export spesifik
 * senaryolarda override edilebilir.
 */
export class StandardPiiMasker implements PiiMasker {
  private readonly maskReplacement: string;

  constructor(maskReplacement: string = "***") {
    this.maskReplacement = maskReplacement;
  }

  detectPiiFields(value: Record<string, unknown>): ReadonlyArray<string> {
    if (!value || typeof value !== "object") return [];
    const out: string[] = [];
    for (const k of Object.keys(value)) {
      if (PII_FIELDS.has(k.toLowerCase())) {
        out.push(k);
      }
    }
    return out;
  }

  maskObject(value: Record<string, unknown>): Record<string, unknown> {
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_FIELDS.has(k.toLowerCase())) {
        // String ise mask'le; null/undefined ise olduigu gibi birak.
        if (typeof v === "string" && v.length > 0) {
          out[k] = this.maskValue(v);
        } else {
          out[k] = v;
        }
      } else if (Array.isArray(v)) {
        out[k] = v.map((item) =>
          item && typeof item === "object"
            ? this.maskObject(item as Record<string, unknown>)
            : item,
        );
      } else if (v && typeof v === "object") {
        out[k] = this.maskObject(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private maskValue(s: string): string {
    if (s.length <= 2) return this.maskReplacement.repeat(s.length);
    return (
      s.slice(0, 2) +
      this.maskReplacement.repeat(Math.max(2, s.length - 4)) +
      s.slice(-2)
    );
  }
}

/** No-op masker (strict PII zorunlulugu olmayan testlerde). */
export class NoopPiiMasker implements PiiMasker {
  detectPiiFields(_value: Record<string, unknown>): ReadonlyArray<string> {
    return [];
  }
  maskObject(value: Record<string, unknown>): Record<string, unknown> {
    return value;
  }
}
