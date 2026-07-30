# Alan Sözlüğü

VetNiva'daki tüm alanların anlamı, tipi, kısıtları ve tenant/güvenlik
etkisi. Yeni alan eklenirken bu sözlüğe satır eklenir; `pnpm docs:check`
form alanlarını bu sözlükle karşılaştırır (Faz 2+).

**Not:** Bu sözlük **alan düzeyindedir** (alan adı + tip + kısıt).
**Varlık/kavram düzeyinde** sözlük için
[`docs/domain/DOMAIN_GLOSSARY.md`](../domain/DOMAIN_GLOSSARY.md)
dosyasına bakın (GOAL-001 ile birlikte üretildi). İlişkiler,
yaşam döngüsü ve silme/düzeltme kuralları orada tanımlıdır.

## Genel (Common)

| Alan         | Tip         | Açıklama                            | Kısıt                                 |
| ------------ | ----------- | ----------------------------------- | ------------------------------------- |
| `id`         | UUID        | Tüm entity'lerin birincil anahtarı. | PK, benzersiz                         |
| `tenant_id`  | UUID        | Tenant sahiplik anahtarı.           | NOT NULL, RLS zorunlu                 |
| `branch_id`  | UUID        | Şube kapsamı.                       | NULL olabilir (cross-branch kayıtlar) |
| `created_at` | timestamptz | Oluşturma zamanı.                   | NOT NULL, default `now()`             |
| `updated_at` | timestamptz | Son güncelleme.                     | NOT NULL, trigger ile güncellenir     |
| `created_by` | UUID        | Oluşturan kullanıcı.                | NULL olabilir (system)                |
| `version`    | int         | Optimistic concurrency.             | NOT NULL, default 0                   |

## Kullanıcı (User) — GOAL-001

| Alan        | Tip    | Açıklama                                                | Kısıt                       |
| ----------- | ------ | ------------------------------------------------------- | --------------------------- |
| `email`     | citext | E-posta adresi.                                         | Tenant içinde unique        |
| `full_name` | text   | Ad soyad.                                               | 3-200 karakter              |
| `phone`     | text   | Telefon (maskeli).                                      | E.164 veya yerel; loglanmaz |
| `role`      | enum   | `OWNER` / `VETERINARIAN` / `STAFF` / `PET_OWNER_PORTAL` | Tenant başına               |
| `status`    | enum   | `invited` / `active` / `suspended`                      | Default `invited`           |

## Hayvan (Patient) — GOAL-002

| Alan                   | Tip          | Açıklama                      | Kısıt                               |
| ---------------------- | ------------ | ----------------------------- | ----------------------------------- |
| `name`                 | text         | Hayvan adı.                   | 1-100                               |
| `species`              | enum         | `CAT` / `DOG` / `BIRD`        | Pilot kapsam                        |
| `breed`                | text         | Irk.                          | NULL olabilir                       |
| `sex`                  | enum         | `MALE` / `FEMALE` / `UNKNOWN` |                                     |
| `birth_date`           | date         | Doğum tarihi.                 | NULL olabilir (tahmini yaş)         |
| `estimated_age_months` | int          | Tahmini yaş (ay).             | NULL olabilir                       |
| `microchip_no`         | text         | Mikroçip numarası.            | Tenant içinde unique; kuşlarda NULL |
| `colour`               | text         | Renk/desen.                   | NULL olabilir                       |
| `weight_kg`            | numeric(6,2) | Ağırlık (kg).                 | NULL olabilir                       |
| `allergies`            | text[]       | Alerji listesi.               | Klinik uyarı olarak gösterilir      |
| `chronic_conditions`   | text[]       | Kronik durum listesi.         | Klinik uyarı                        |
| `warnings`             | text[]       | Özel uyarılar.                | Klinik uyarı                        |

## Aşı (Vaccination) — GOAL-003

| Alan              | Tip         | Açıklama                      | Kısıt                |
| ----------------- | ----------- | ----------------------------- | -------------------- |
| `patient_id`      | UUID        | Hayvan referansı.             | FK, NOT NULL         |
| `product_id`      | UUID        | Aşı ürünü.                    | FK, NOT NULL         |
| `lot_id`          | UUID        | Lot referansı.                | FK, NOT NULL         |
| `administered_by` | UUID        | Uygulayan veteriner.          | FK, NOT NULL         |
| `administered_at` | timestamptz | Uygulama zamanı.              | NOT NULL             |
| `dose`            | text        | Uygulanan doz.                | ör. "1 ml SC"        |
| `site`            | text        | Uygulama yeri.                | ör. "sağ ön kol"     |
| `next_due_at`     | timestamptz | Tekrar tarihi.                | NULL olabilir        |
| `idempotency_key` | text        | Tekrar koruma.                | Tenant içinde unique |
| `amends_id`       | UUID        | Düzeltme/amendment referansı. | NULL olabilir        |

## Hassas alanlar

Bu alanlar teknik loglara veya uygulama dışı çıktılara yazılmaz:

- `phone` (maskeli: `+90 XXX XXX 12 34`)
- `email` (yalnızca admin görünümü)
- `microchip_no` (yalnızca klinik personeli)
- `allergies`, `chronic_conditions` (klinik içerik)
- SOAP notları, reçete detayları (klinik içerik)
- Ödeme kartı verisi (Faz 7+, **saklanmaz**)
