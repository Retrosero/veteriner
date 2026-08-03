/**
 * @file Worker gözlemlenebilirlik PII maskeleyicisi.
 * @module @vetniva/worker/observability/pii-masker
 * @description Worker'ın PostgreSQL'e yazdığı job input/output ve hata
 * metinlerini maskeleyerek merkezi log politikasını API dışındaki süreçte
 * de uygular.
 * @security Parola, token ve doğrudan kimlik alanları tamamen redakte edilir;
 * serbest metindeki e-posta, telefon, TCKN, IBAN ve kart numaraları da
 * kalıcı job kaydına yazılmadan önce maskelenir.
 */

/** Yapısal payload'da hiçbir zaman saklanmayacak alanlar. */
const SENSITIVE_KEYS = new Set<string>([
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
  "birth_date",
  "vet_license_no",
  "ip_address",
  "user_agent",
  "device_id",
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

/** Bir anahtarı snake_case'e normalleştirerek API log politikasıyla eşler. */
function normalizeKey(key: string): string {
  return key
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .toLowerCase();
}

/** Serbest metindeki yaygın PII örüntülerini geri döndürülemez biçimde maskeler. */
export function maskWorkerString(input: string): string {
  return input
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***")
    .replace(/\bTR\d{24}\b/gi, "***")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "***")
    .replace(/\b\d{11}\b/g, "***")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, (candidate) => {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? "***" : candidate;
    });
}

/**
 * Job payload'ını PII açısından temizler.
 * @description Girdi nesnesini mutate etmez; iç içe dizi ve nesneler için
 * aynı kuralı özyineli uygular. Bilinmeyen değerler korunur; yalnız string
 * değerlerde serbest metin maskesi uygulanır.
 * @param value
 */
export function maskWorkerPayload(value: unknown): unknown {
  if (typeof value === "string") return maskWorkerString(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => maskWorkerPayload(item));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(normalizeKey(key))
        ? "[redacted]"
        : maskWorkerPayload(item),
    ]),
  );
}
