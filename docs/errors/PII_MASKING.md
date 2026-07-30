# @file PII Maskeleme Standardı.
# @module docs/errors/PII_MASKING
#
# @description VetNiva'da kişisel bilgilerin (PII) log,
# audit, hata response ve telemetride nasıl
# maskeleneceğini tanımlar. KVKK (TR) ve UK GDPR
# uyumluluğu için zorunlu.
#
# @author GOAL-004 (FAZ-0) audit + log + hata standardı
# @since 2026-07-30
# @security PII asla plain text loglanmaz. Hash veya
#   mask ile değiştirilir. Production'da development
#   log seviyesi "info" altına indirilmez.
# =============================================================================

# PII Maskeleme Standardı

VetNiva, hasta sahibi (kişi) ve hayvan sahibi verilerini
işler. **Kişisel bilgi (PII)** içeren alanlar log, audit,
hata response ve telemetride **asla plain text**
bulunmaz. Bu standart, KVKK (TR) ve UK GDPR (GB)
uyumluluğu için zorunludur.

## 1. PII Alanları

Aşağıdaki alanlar PII kapsamındadır. Tenant bazında ek
alanlar (ör. `vet_license_number`) de PII sayılabilir;
bunlar `docs/fields/FIELD_GLOSSARY.md`'de işaretlenir.

### 1.1 Doğrudan tanımlayıcı

| Alan             | Tür                | Hassasiyet | Maskeleme       |
| ---------------- | ------------------ | ---------- | --------------- |
| `first_name`     | ad                 | yüksek     | ilk harf + `*`  |
| `last_name`      | soyad              | yüksek     | ilk harf + `*`  |
| `full_name`      | tam ad             | yüksek     | mask            |
| `email`          | e-posta            | yüksek     | `j***@e.com`    |
| `phone`          | telefon            | yüksek     | `5** *** ** 34` |
| `tax_id`         | VKN/TCKN          | yüksek     | hash (SHA-256)  |
| `iban`           | IBAN               | yüksek     | `TR12 **** ****` |
| `passport_no`    | pasaport no        | yüksek     | mask            |
| `id_card_no`     | kimlik no (TR)     | yüksek     | hash            |
| `address`        | adres              | orta       | il/ilçe         |
| `postal_code`    | posta kodu         | düşük      | plain (kamuya açık) |
| `birth_date`     | doğum tarihi       | orta       | yıl            |
| `nationality`    | uyruk              | düşük      | plain          |
| `gender`         | cinsiyet           | orta       | plain (klinik gereği) |
| `vet_license_no` | veteriner diploma  | orta       | mask            |

### 1.2 Dolaylı tanımlayıcı

| Alan           | Maskeleme        |
| -------------- | ---------------- |
| `ip_address`   | son oktet mask   |
| `user_agent`   | hash            |
| `device_id`    | hash            |
| `session_id`   | plain (sunucu log) |
| `cookie_id`    | plain (sunucu log) |

### 1.3 Klinik / finansal içerik (PII değil, ama hassas)

Klinik kayıtlar (muayene, aşı, reçete) ve finansal
hareketler PII değildir ancak yüksek hassasiyet
taşır. **Asla** düz metin loglanmaz; yalnızca ID
(`patient_id`, `invoice_id`) ile referans verilir.

## 2. Maskeleme Kuralları

### 2.1 Varsayılan: Görünür mask

Bir PII alan log'a yazılacaksa:

| Tür           | Kural                  | Örnek              |
| ------------- | ---------------------- | ------------------ |
| Ad            | İlk harf + `***`       | `A***`             |
| Soyad         | İlk harf + `***`       | `Y***`             |
| E-posta       | İlk harf + `***@domain` | `a***@example.com` |
| Telefon       | Son 2 hane görünür     | `5** *** ** 34`    |
| TCKN          | İlk 3 + `***` + son 2  | `123***45`         |
| VKN           | İlk 2 + `***` + son 2  | `12***89`          |
| IBAN          | Ülke kodu + ` **** **** **** ` + son 4 | `TR12 **** **** **** 1234` |
| Adres         | Yalnızca il/ilçe       | `Kadıköy, İstanbul` |
| Doğum tarihi  | Yıl                    | `1990`             |

### 2.2 Güçlü: Hash (SHA-256 + salt)

Arama / correlation için PII alanı hash'lenmiş haliyle
kullanılabilir:

```ts
import { createHash, randomBytes } from "node:crypto";

const PII_SALT = process.env.PII_SALT ?? randomBytes(32).toString("hex");

export function hashPii(value: string): string {
  return createHash("sha256")
    .update(PII_SALT)
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

// hashPii("12345678950") → "7c9e6679b7425a8d"
```

**Kullanım:** Audit log'da aynı kişiyi farklı
event'lerde takip etmek için (KVKK silme talebinde
tüm izleri bulmak).

### 2.3 Tokenizasyon (gelecek)

Ödeme / entegrasyon PII alanları için
`@vetniva/security` paketinde tokenization
yardımcısı (Faz 10'da).

## 3. Uygulama

### 3.1 PII Masker Service

```ts
// apps/api/src/common/logging/pii-masker.ts
import { createHash } from "node:crypto";

const PII_FIELDS = new Set([
  "first_name", "last_name", "full_name",
  "email", "phone", "tax_id", "iban",
  "passport_no", "id_card_no", "address",
  "vet_license_no", "ip_address", "user_agent",
  "device_id", "birth_date",
]);

export class PiiMasker {
  public mask<T>(payload: T): T {
    return this.walk(payload as unknown) as T;
  }

  private walk(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => this.walk(v));

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_FIELDS.has(k)) {
        out[k] = this.maskValue(k, v);
      } else {
        out[k] = this.walk(v);
      }
    }
    return out;
  }

  private maskValue(field: string, value: unknown): unknown {
    if (typeof value !== "string") return "[redacted]";
    switch (field) {
      case "first_name":
      case "last_name":
        return value[0]?.toUpperCase() + "***";
      case "email":
        return value.replace(/^[^@]/, (m) => m[0] + "***");
      case "phone":
        return value.replace(/\d(?=\d{2})/g, "*");
      case "tax_id":
        return value.slice(0, 3) + "***" + value.slice(-2);
      case "iban":
        return value.slice(0, 4) + " **** **** **** " + value.slice(-4);
      case "birth_date":
        return value.slice(0, 4); // year only
      case "address":
        return value.split(",").slice(-2).join(",").trim(); // il/ilçe
      case "ip_address":
        return value.replace(/\.\d+$/, ".***");
      case "user_agent":
      case "device_id":
        return this.hash(value);
      default:
        return "[redacted]";
    }
  }

  private hash(value: string): string {
    return createHash("sha256")
      .update(process.env.PII_SALT ?? "vetniva")
      .update(value)
      .digest("hex")
      .slice(0, 16);
  }
}
```

### 3.2 Logger Entegrasyonu

```ts
// apps/api/src/common/logging/logger.service.ts
this.logger.log({
  ...this.piiMasker.mask(payload),
  correlation_id: ctx.requestId,
});
```

Her log satırı çıkmadan önce `PiiMasker.mask()` çağrılır.

### 3.3 Audit Entegrasyonu

```ts
// apps/api/src/common/audit/audit.service.ts
await this.audit.record({
  ...this.piiMasker.mask(event),
  tenant_id, user_id, correlation_id, action,
});
```

Audit payload'larında PII alanları mask'li haliyle
saklanır; raw değer yalnızca DB satırında kalır.

## 4. ErrorResponse Davranışı

`ErrorResponse.details` alanında PII **bulunmaz**.
Sadece yapısal bilgi (`field`, `expected_format`):

```json
{
  "error_code": "VET-VALIDATION-0001",
  "message": "Telefon numarası geçersiz",
  "details": {
    "field": "phone",
    "expected_format": "E.164 (5XXXXXXXXX)"
  }
}
```

❌ **Yapılmaz:**

```json
{
  "details": {
    "field": "phone",
    "value": "05321234567"  ← PII sızıntısı
  }
}
```

## 5. UI Davranışı

Frontend'de PII alanları gösterilirken:

- **Geliştirici console:** PII mask'lenir (devtools
  log'larında).
- **Hata toast:** `t(\`error.\${code}\`)` ile sadece
  genel mesaj gösterilir.
- **Ekran görüntüsü desteği:** Hassas alanlar
  overlay ile mask'lenir (`<SensitiveField />`).

## 6. Test

`pnpm test` aşağıdakileri kontrol eder:

1. **PiiMasker unit testleri:** Her PII alanı için
   beklenen mask formatı.
2. **Fuzz test:** Rastgele PII içeren payload
   loglandığında plain text kalmamalı.
3. **Audit/event payload:** `audit_events` tablosuna
   yazılan kayıt PII içermemeli.
4. **Error response:** `details` PII sızdırmamalı.

## 7. Uyum (Compliance)

- **KVKK (TR):** Madde 12 — veri güvenliği. PII log
  sızıntısı ihlal sayılır.
- **UK GDPR:** Article 32 — security of processing.
- **PCI-DSS:** Kart numarası tamamen yasak; mask
  formatı `**** **** **** 1234`.
- **KVKK silme talebi:** `tax_id` veya `email`
  hash'i ile tüm audit event'ler bulunur, PII
  alanları NULL'lanır.

## 8. Operasyonel

- **Yeni PII alanı:** Eklemeden önce bu dökümana
  ekle + CI testi güncelle.
- **PII sızıntısı tespit:** Log aggregator'da alert
  kuralı: `first_name` veya `phone` plain text
  içeren log varsa PagerDuty.

## İlgili dokümanlar

- [`CORRELATION_ID.md`](./CORRELATION_ID.md) — log
  ilişkilendirme.
- [`LOG_STANDARD.md`](./LOG_STANDARD.md) — log türleri.
- [`AUDIT_LOG_STANDARD.md`](./AUDIT_LOG_STANDARD.md) —
  audit event yapısı.
- [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) —
  hata response formatı.
- [`../../docs/fields/FIELD_GLOSSARY.md`](../../docs/fields/FIELD_GLOSSARY.md)
  — alan sözlüğü (PII işaretleri).
