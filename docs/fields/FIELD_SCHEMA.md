# @file Alan Sözlüğü Şeması.

# @module docs/fields/FIELD_SCHEMA

#

# @description VetNiva'daki tüm alanların (veritabanı

# kolonları + form alanları) ortak sözlük şeması.

# Alan adı, tip, kısıt, PII etiketi, validation, locale

# açıklaması.

#

# @author GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu

# @since 2026-07-30

# @security `pii: true` alanlar mask'lenir (PII_MASKING.md).

# Plain text PII asla loglanmaz.

# =============================================================================

# Alan Sözlüğü Şeması

`docs/fields/FIELD_GLOSSARY.md` (Markdown tablo) ve ileride
`docs/fields/fields.yaml` (machine-readable) ile tüm alanlar
tek yerden tanımlanır. Bu şema, hem veritabanı kolonları hem
form alanları hem de API request/response payload'ları için
geçerlidir.

## 1. Alan Kimliği

Her alanın `field_id` (qualified name) vardır:

```
<entity>.<field_name>
```

**Örnekler:**

- `patient.microchip` — patient entity'sinin microchip alanı
- `owner.tax_id` — owner entity'sinin tax_id alanı
- `appointment.start_at` — appointment entity'sinin start_at
- `payment.amount` — payment entity'sinin amount

**Kural:** Küçük harf, nokta ayraç. Tire kullanılabilir
(`vet_license_no` → `owner.vet_license_no`).

## 2. Zorunlu Alanlar (Glossary Tablosu)

`FIELD_GLOSSARY.md` tablosu için zorunlu kolonlar:

| Kolon            | Açıklama                           |
| ---------------- | ---------------------------------- |
| `field_id`       | Qualified alan adı.                |
| `entity`         | Varlık tipi (patient, owner, ...). |
| `name`           | Alan adı.                          |
| `type`           | Veri tipi (aşağıdaki enum).        |
| `required`       | Zorunlu mu?                        |
| `pii`            | PII alanı mı?                      |
| `unique`         | Unique constraint var mı?          |
| `description_tr` | Türkçe açıklama.                   |
| `description_en` | İngilizce açıklama.                |
| `validation`     | Kısıt (regex, min/max, enum).      |
| `related_chunk`  | `field-<field_id>` chunk_id.       |
| `version`        | Semver.                            |

## 3. Veri Tipleri (Type Enum)

| Tip        | Prisma / DB karşılığı          | Örnek        |
| ---------- | ------------------------------ | ------------ |
| `string`   | `text` / `varchar(n)`          | `first_name` |
| `number`   | `integer`                      | `age_years`  |
| `decimal`  | `numeric(p,s)` / `Decimal`     | `amount`     |
| `boolean`  | `boolean`                      | `is_active`  |
| `date`     | `date`                         | `birth_date` |
| `datetime` | `timestamptz`                  | `created_at` |
| `time`     | `time`                         | `start_time` |
| `enum`     | `enum` (DB) / `string` (TS)    | `species`    |
| `uuid`     | `uuid`                         | `id`         |
| `json`     | `jsonb`                        | `metadata`   |
| `array`    | `text[]` / `jsonb`             | `tags`       |
| `currency` | `numeric(p,s)` + ISO 4217 code | `price`      |

## 4. PII Etiketi

Aşağıdaki alanlar `pii: true` olarak işaretlenir:

| Alan kategorisi      | Örnekler                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Doğrudan tanımlayıcı | `first_name`, `last_name`, `email`, `phone`, `tax_id`, `iban`, `passport_no`, `id_card_no` |
| Adres                | `address` (il/ilçe)                                                                        |
| Klinik bağlam        | `birth_date` (yıl), `vet_license_no`                                                       |
| Dolaylı tanımlayıcı  | `ip_address`, `user_agent`, `device_id`                                                    |

Detay: [`../errors/PII_MASKING.md`](../errors/PII_MASKING.md).

## 5. Validation Kuralları

`validation` kolonu kısıtları tanımlar:

| Kısıt         | Format | Örnek                                                 |
| ------------- | ------ | ----------------------------------------------------- |
| `min_length`  | int    | `min_length: 1`                                       |
| `max_length`  | int    | `max_length: 100`                                     |
| `pattern`     | regex  | `pattern: "^[0-9]{10}$"`                              |
| `min`         | number | `min: 0`                                              |
| `max`         | number | `max: 999999.99`                                      |
| `enum_values` | list   | `enum_values: [TR, GB]`                               |
| `format`      | enum   | `format: email` / `format: e.164` / `format: iso8601` |

## 6. Örnek Alan Tanımı

```yaml
- field_id: patient.microchip
  entity: patient
  name: microchip
  type: string
  required: true
  pii: false
  unique: true
  description_tr: "ISO 11784/11785 uyumlu 15 haneli mikroçip numarası."
  description_en: "ISO 11784/11785 compliant 15-digit microchip number."
  validation:
    pattern: "^[0-9]{15}$"
    min_length: 15
    max_length: 15
  related_chunk: field-patient.microchip
  version: "1.0.0"

- field_id: owner.tax_id
  entity: owner
  name: tax_id
  type: string
  required: false
  pii: true
  unique: true
  description_tr: "TCKN (11 hane) veya VKN (10 hane)."
  description_en: "TCKN (11 digits) or VKN (10 digits)."
  validation:
    pattern: "^([0-9]{10}|[0-9]{11})$"
  related_chunk: field-owner.tax_id
  version: "1.0.0"
```

## 7. Markdown Tablo Formatı

`FIELD_GLOSSARY.md` insan okunabilir tablo olarak da tutulur:

```markdown
| field_id            | entity  | name      | type   | required | pii | unique | description_tr  | description_en  | validation    |
| ------------------- | ------- | --------- | ------ | :------: | :-: | :----: | --------------- | --------------- | ------------- |
| `patient.microchip` | patient | microchip | string |    ✓     |  –  |   ✓    | ISO 11784/11785 | ISO 11784/11785 | `^[0-9]{15}$` |
| `owner.tax_id`      | owner   | tax_id    | string |    –     |  ✓  |   ✓    | TCKN/VKN        | TCKN/VKN        | `^([0-9]{10}  | [0-9]{11})$` |
```

## 8. CI Doğrulama

`pnpm docs:check` şunları doğrular:

1. **Benzersizlik:** `field_id` tekrarsız.
2. **Type geçerliliği:** Tip enum'unda var mı?
3. **PII etiketi:** PII_MASKING.md'deki alanlar `pii: true` olmalı.
4. **Validation tutarlılığı:** Tip ile validation uyumlu
   (örn. `string` + `min: 0` hata).
5. **Chunk tutarlılığı:** `related_chunk` AI_CHUNKS.yaml'da var mı?
6. **i18n parity:** `description_tr` ve `description_en` her ikisi
   de dolu.

## 9. Chunk Dönüşümü

Her alan otomatik bir AI chunk'ına dönüşür:

```yaml
- chunk_id: field-patient.microchip
  type: field
  source: docs/fields/fields.yaml
  field_id: patient.microchip
  locale: tr-TR
  version: "1.0.0"
  last_verified_at: 2026-07-30
  pii: false
  title: "Hasta Mikroçip Numarası"
  content: |
    Hasta mikroçip numarası. ISO 11784/11785 uyumlu
    15 haneli sayısal alan. Her hayvan için unique
    olmalı. Klinik kayıt ve sahiplik devrinde referans
    alanı olarak kullanılır.
  keywords:
    - mikroçip
    - microchip
    - hayvan tanımlama
    - pet id
```

## İlgili dokümanlar

- [`../ai/CHUNK_SCHEMA.md`](../ai/CHUNK_SCHEMA.md) — chunk yapısı.
- [`../pages/PAGE_SCHEMA.md`](../pages/PAGE_SCHEMA.md) — sayfa
  kaydı.
- [`../api/API_SCHEMA.md`](../api/API_SCHEMA.md) — API endpoint.
- [`../errors/PII_MASKING.md`](../errors/PII_MASKING.md) — PII
  maskeleme kuralları.
- [`../errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md) —
  hata kataloğu.
- [`../../docs/domain/DOMAIN_GLOSSARY.md`](../../docs/domain/DOMAIN_GLOSSARY.md)
  — entity tanımları.
