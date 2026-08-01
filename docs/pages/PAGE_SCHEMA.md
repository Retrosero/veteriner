# @file Sayfa Kataloğu Şeması.

# @module docs/pages/PAGE_SCHEMA

#

# @description VetNiva'daki tüm UI sayfaları için

# makinece okunabilir + insan okunabilir şema. Her

# sayfa kaydı bu şemaya uygun yazılır; `pnpm docs:check`

# tutarlılığı doğrular.

#

# @author GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu

# @since 2026-07-30

# @security `purpose` ve `step_by_step` alanları PII

# içermemeli; sadece yapısal bilgi taşır.

# =============================================================================

# Sayfa Kataloğu Şeması

Her UI sayfası (Next.js `app/[locale]/<page>/page.tsx` veya
gelecekte native mobil ekran) `docs/pages/` altında bir YAML
kaydı ile temsil edilir. Bu kayıt hem **insan** (ürün ekibi
için) hem **makine** (AI asistanı + CI) için tek kaynaktır.

## 1. Konum ve İsimlendirme

```
docs/pages/
  web.<app>.<locale>.<page>.yaml      # Web sayfası
  api.<app>.<locale>.<page>.yaml      # Native mobil (Faz 12+)
```

**Örnekler:**

- `web.app.locale.yaml` — landing
- `web.app.locale.health.yaml` — health
- `web.app.locale.dashboard.yaml` — dashboard (Faz 1+)
- `web.app.locale.clinic.patients.yaml` — hasta listesi (Faz 2+)

**Kural:** Dosya adı `<app>.<locale>.<...sayfa yolu>` olmalı.
Dosya adı, Next.js `app/<locale>/<...>/page.tsx` yolundan
türetilir. Tire alt çizgi ile değiştirilir.

## 2. Zorunlu Alanlar

| Alan                   | Tür        | Açıklama                                                                                                                       |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `page_id`              | string     | Benzersiz ID. Dosya adıyla aynı.                                                                                               |
| `route`                | string     | URL pattern (`/app/[locale]/health` veya `/[locale]`).                                                                         |
| `module`               | enum       | `landing` / `health` / `dashboard` / `clinic` / `petshop` / `finance` / `settings` / `auth` vb. Modüller GOAL-002 ile tanımlı. |
| `title_key`            | string     | i18n anahtarı (`health.title`).                                                                                                |
| `purpose`              | map        | `tr-TR` / `en-GB` açıklama (1-3 cümle).                                                                                        |
| `allowed_roles`        | string[]   | Boş olabilir (public). Eğer varsa: `SUPERADMIN` / `OWNER` / `VETERINARIAN` / `STAFF` / `PET_OWNER_PORTAL`.                     |
| `required_permissions` | string[]   | `<domain>:<resource>:<action>` formatında. Boş olabilir.                                                                       |
| `prerequisites`        | string[]   | Sayfanın açılması için gereken koşullar (örn. `auth.session`).                                                                 |
| `fields`               | Field[]    | Sayfadaki form alanları / gösterilen alanlar.                                                                                  |
| `actions`              | Action[]   | Sayfadaki buton / aksiyonlar.                                                                                                  |
| `step_by_step`         | map        | `tr-TR` / `en-GB` adım adım kullanım.                                                                                          |
| `possible_errors`      | ErrorRef[] | Karşılaşılabilecek hata kodları + çözüm.                                                                                       |
| `related_pages`        | string[]   | Diğer sayfa `page_id`'leri.                                                                                                    |
| `related_api`          | string[]   | İlgili API endpoint'leri.                                                                                                      |
| `keywords`             | map        | `tr-TR` / `en-GB` arama anahtar kelimeleri.                                                                                    |
| `version`              | string     | Semver.                                                                                                                        |
| `last_verified_at`     | ISO 8601   | Son doğrulama tarihi.                                                                                                          |

## 3. Field (Alan) Tanımı

```yaml
fields:
  - key: patient.microchip
    label_key: patient.microchip.label
    description:
      tr-TR: "ISO 11784/11785 uyumlu 15 haneli mikroçip numarası."
      en-GB: "ISO 11784/11785 compliant 15-digit microchip number."
    type: string
    required: true
    pii: false
    validation:
      min_length: 15
      max_length: 15
      pattern: "^[0-9]{15}$"
    related_field_chunk: field-patient.microchip
```

| Alan                  | Tür     | Açıklama                                                                                                      |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `key`                 | string  | Alan adı (nokta ile qualified).                                                                               |
| `label_key`           | string  | i18n anahtarı.                                                                                                |
| `description`         | map     | `tr-TR` / `en-GB` açıklama.                                                                                   |
| `type`                | enum    | `string` / `number` / `boolean` / `date` / `datetime` / `enum` / `array` / `object` / `currency` / `percent`. |
| `required`            | boolean | Form alanı zorunlu mu?                                                                                        |
| `pii`                 | boolean | PII alanı mı? (Mask'leme için.)                                                                               |
| `validation`          | object  | `min_length`, `max_length`, `pattern`, `min`, `max`, `enum_values`.                                           |
| `related_field_chunk` | string  | FIELD_GLOSSARY'deki chunk_id.                                                                                 |

## 4. Action (Aksiyon) Tanımı

```yaml
actions:
  - key: save
    description:
      tr-TR: "Form verilerini doğrular ve sunucuya gönderir."
      en-GB: "Validates form data and submits to the server."
    button_label_key: common.save
    required_permission: clinic:patient:create
    related_api:
      - POST /api/v1/clinic/patients
    confirm: false
    destructive: false
```

| Alan                  | Tür      | Açıklama                          |
| --------------------- | -------- | --------------------------------- |
| `key`                 | string   | Aksiyon adı.                      |
| `description`         | map      | `tr-TR` / `en-GB`.                |
| `button_label_key`    | string   | i18n anahtarı.                    |
| `required_permission` | string   | Permission spec.                  |
| `related_api`         | string[] | API endpoint.                     |
| `confirm`             | boolean  | Onay modal'i gerekiyor mu?        |
| `destructive`         | boolean  | Silme / geri alınamaz aksiyon mu? |

## 5. Error Reference (Hata Referansı)

```yaml
possible_errors:
  - error_code: VET-CLINIC-0003
    when:
      tr-TR: "Mikroçip numarası başka bir hayvanda kayıtlı."
      en-GB: "Microchip number is registered to another patient."
    resolution:
      tr-TR: "Mikroçip numarasını kontrol edin veya farklı bir hayvan seçin."
      en-GB: "Verify the microchip number or select a different patient."
    related_chunk: error-VET-CLINIC-0003
```

## 6. Örnek Tam Kayıt

```yaml
page_id: web.app.locale.health
route: "/[locale]/health"
module: health
title_key: health.title
purpose:
  tr-TR: "API'nin ve bağımlılıklarının (veritabanı) canlı durumunu gösterir."
  en-GB: "Shows the live status of the API and its dependencies."
allowed_roles: []
required_permissions: []
prerequisites:
  - "API_BASE_URL env set"
fields:
  - key: status
    label_key: health.status
    description:
      tr-TR: "Genel sağlık durumu."
      en-GB: "Overall health status."
    type: enum
    required: true
    pii: false
    validation:
      enum_values: [ok, degraded, down]
actions:
  - key: refresh
    description:
      tr-TR: "Sayfayı yeniden yükler."
      en-GB: "Reloads the page."
    button_label_key: common.retry
    confirm: false
    destructive: false
step_by_step:
  tr-TR:
    - "Sayfayı aç."
    - "Status, DB ve sürüm bilgisini kontrol et."
  en-GB:
    - "Open the page."
    - "Check status, DB and version info."
possible_errors:
  - error_code: VET-COMMON-0001
    resolution:
      tr-TR: "API erişilemiyor."
      en-GB: "API unreachable."
related_pages:
  - web.app.locale
related_api:
  - GET /api/v1/health
keywords:
  tr-TR: [sağlık, sistem durumu, monitoring, db]
  en-GB: [health, status, monitoring, db]
version: "1.0.0"
last_verified_at: "2026-07-30"
```

## 7. CI Doğrulama

`pnpm docs:check` şunları doğrular:

1. **Zorunlu alanlar:** Her sayfa kaydında tüm zorunlu alanlar var.
2. **Type kontrolü:** `module`, `type`, `enum_values` enum'ları geçerli.
3. **i18n parity:** `purpose`, `step_by_step`, `keywords` tr-TR ve en-GB için tutarlı.
4. **Permission geçerliliği:** `required_permission` PERMISSION_CATALOG'da var.
5. **API geçerliliği:** `related_api` API_SCHEMA'da var.
6. **Error code geçerliliği:** `possible_errors.error_code` ERROR_CATALOG'da var.
7. **Route benzersizliği:** Aynı `route` iki sayfada olmamalı.
8. **Orphan:** Kodda karşılığı olmayan sayfa kaydı (warning).

## 8. Versiyonlama

- **Major:** Yeni alan, yeni zorunlu parametre, breaking değişiklik.
- **Minor:** Yeni opsiyonel alan, yeni action, yeni related.
- **Patch:** Yazım, açıklama düzeltme.

`last_verified_at` 90 günü geçen sayfa `degraded` flag'i alır.

## İlgili dokümanlar

- [`../ai/CHUNK_SCHEMA.md`](../ai/CHUNK_SCHEMA.md) — chunk
  dönüşüm şeması.
- [`../api/API_SCHEMA.md`](../api/API_SCHEMA.md) — API endpoint
  şeması.
- [`../fields/FIELD_SCHEMA.md`](../fields/FIELD_SCHEMA.md) —
  alan sözlüğü şeması.
- [`../errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md) —
  hata kodu kataloğu.
- [`../../docs/permissions/PERMISSION_CATALOG.yaml`](../../docs/permissions/PERMISSION_CATALOG.yaml)
  — yetki kataloğu.
