/**
 * @file PII Masker.
 * @module apps/api/common/logging/pii-masker
 * @description PII alanlarını log/audit payload'larında
 * mask'ler. Tüm log çağrıları bu servisten geçmeden
 * yazılmaz. Kurallar: docs/errors/PII_MASKING.md.
 * @security Plain text PII asla loglanmaz. Hash'leme
 *   SHA-256 + PII_SALT. KVKK / UK GDPR uyumlu.
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { createHash } from "node:crypto";

/**
 * PII alanları kümesi. Yeni alan eklenirse bu listeye
 * eklenmeli ve PII_MASKING.md güncellenmeli.
 */
const PII_FIELDS = new Set<string>([
  // Direct identifiers
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "tax_id",
  "iban",
  "passport_no",
  "id_card_no",
  "address",
  "vet_license_no",
  "birth_date",
  // Indirect identifiers
  "ip_address",
  "user_agent",
  "device_id",
  // Auth secrets (always redact)
  "password",
  "current_password",
  "new_password",
  "token",
  "refresh_token",
  "api_key",
  "secret",
  "authorization",
  "cookie",
]);

/**
 * PII maskeleme servisi. Her log payload'ı bu servisten
 * geçirilir; PII alanları mask'lenir veya hash'lenir.
 */
export class PiiMasker {
  private readonly salt: string;

  constructor(salt?: string) {
    this.salt = salt ?? process.env.PII_SALT ?? "vetniva-dev-salt";
  }

  /**
   * Verilen payload'daki tüm PII alanlarını mask'ler.
   * Nested objeler ve diziler desteklenir.
   * @param payload
   */
  public mask<T>(payload: T): T {
    return this.walk(payload) as T;
  }

  /**
   * Serbest metin içerisindeki PII örüntülerini mask'ler. Not
   * gövdesi, hata mesajı gibi yapısal olmayan string'ler için
   * tasarlandı. Email/telefon/TCKN/IBAN/kart no gibi yaygın
   * örüntüleri `***` ile değiştirir; diğer içerik korunur.
   *
   * NOT: Bilgi sızdırmaz; sadece doğrudan tespit edilebilen
   * PII parçaları mask'lenir. Yapısal payload'lar için `mask`
   * tercih edilmelidir.
   * @param input
   */
  public maskString(input: string): string {
    if (typeof input !== "string" || input.length === 0) return input;
    let s = input;
    // Email
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***");
    // Telefon (basit: 10+ ardışık rakam, gruplama)
    s = s.replace(/\+?\d[\d\s\-()]{8,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) return m;
      return "***";
    });
    // TCKN (11 haneli sayı)
    s = s.replace(/\b\d{11}\b/g, "***");
    // Kart no (16 haneli)
    s = s.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "***");
    // IBAN (TR + 24 hane)
    s = s.replace(/\bTR\d{24}\b/gi, "***");
    return s;
  }

  private walk(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => this.walk(v));

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        if (PII_FIELDS.has(key)) {
          return [key, this.maskValue(key, val)];
        }
        if (val !== null && typeof val === "object") {
          return [key, this.walk(val)];
        }
        return [key, val];
      }),
    );
  }

  private maskValue(field: string, value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== "string") return "[redacted]";
    const v = value;

    switch (field) {
      case "first_name":
      case "last_name": {
        if (v.length === 0) return "";
        return v[0]!.toUpperCase() + "***";
      }
      case "full_name": {
        return v
          .split(" ")
          .map((part) =>
            part.length > 0 ? part[0]!.toUpperCase() + "***" : "",
          )
          .join(" ");
      }
      case "email": {
        const at = v.indexOf("@");
        if (at <= 0) return "***";
        return v[0] + "***" + v.slice(at);
      }
      case "phone": {
        return v.replace(/\d(?=\d{2})/g, "*");
      }
      case "tax_id": {
        if (v.length < 5) return "***";
        return v.slice(0, 3) + "***" + v.slice(-2);
      }
      case "iban": {
        if (v.length < 8) return "***";
        return v.slice(0, 4) + " **** **** **** " + v.slice(-4);
      }
      case "birth_date": {
        // ISO 8601 → sadece yıl
        const year = v.slice(0, 4);
        return Number.isFinite(Number(year)) ? year : "[redacted]";
      }
      case "address": {
        const parts = v
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length <= 1) return "[redacted]";
        return parts.slice(-2).join(", ");
      }
      case "ip_address": {
        // IPv4 son oktet mask; IPv6 tamamı mask
        if (v.includes(":")) return "***";
        return v.replace(/\.\d+$/, ".***");
      }
      case "user_agent":
      case "device_id": {
        return this.hash(v);
      }
      case "password":
      case "current_password":
      case "new_password":
      case "token":
      case "refresh_token":
      case "api_key":
      case "secret":
      case "authorization":
      case "cookie":
        return "[redacted]";
      default:
        return "[redacted]";
    }
  }

  /**
   * Tek bir değeri SHA-256 ile hash'ler (PII salt ile).
   * Audit trail'de aynı kişiyi takip için kullanılır.
   * @param value
   */
  public hash(value: string): string {
    return createHash("sha256")
      .update(this.salt)
      .update(value)
      .digest("hex")
      .slice(0, 16);
  }
}
