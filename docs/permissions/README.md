# Yetki ve İzin Dokümanları

Bu klasör, VetNiva'nın rol tabanlı erişim kontrol (RBAC)
sistemi için tüm dokümanları içerir. Pilot kapsamda 5 temel rol
ve 113 permission tanımlıdır.

## Dosyalar

- [`PERMISSION_CATALOG.yaml`](./PERMISSION_CATALOG.yaml) — **makinece
  okunabilir** tam katalog. Her permission için resource_type,
  action, tenant_scope, branch_scope, self_only, audit, pii,
  amend flag'leri. CI kapısı `pnpm docs:check` bunu referans alır.
- [`PERMISSION_MATRIX.md`](./PERMISSION_MATRIX.md) — **insan
  okunabilir** modül bazlı özet tablolar. 5 rol × 28 modül
  için ✓/— işaretleri.
- [`ROLE_DESCRIPTIONS.md`](./ROLE_DESCRIPTIONS.md) — 5 temel
  rol için detaylı sorumluluk açıklamaları, kapsam dışı
  durumlar, tipik senaryolar.

## Format

Permission anahtarı formatı: `<domain>:<resource>:<action>`

- **domain:** `common`, `tenant`, `branch`, `user`, `role`,
  `clinic`, `petshop`, `cash`, `portal`, `audit`, `file`,
  `report`
- **resource:** Varlık adı (örn. `appointment`, `patient`,
  `vaccination`, `sale`)
- **action:** `read`, `create`, `update`, `archive`, `amend`,
  `export`, `manage`, `sign`, `dispense`, `cancel`, vb.

**Örnekler:**

- `clinic:appointment:create` — Randevu oluşturma
- `clinic:vaccination:amend` — Aşı kaydı amendment (düzeltme)
- `petshop:sale:refund` — Petshop satış iadesi
- `portal:animal:read` — Portal: kendi hayvanlarını görme
- `audit:log:export` — Audit log dışa aktarma

## 5 Temel Rol

| Rol | Amaç | Kapsam |
| --- | --- | --- |
| `SUPERADMIN` | Platform yönetimi (onboarding, fatura, sistem) | Tüm tenant'lar |
| `OWNER` | İşletme sahibi (kullanıcı + finans + tüm veri) | Kendi tenant'ı |
| `VETERINARIAN` | Klinik tıbbi (muayene, aşı, reçete, ameliyat) | Kendi tenant'ı |
| `STAFF` | Resepsiyon + petshop kasiyer (tıbbi değil) | Kendi tenant'ı, atanmış şube |
| `PET_OWNER_PORTAL` | Salt okunur kendi hayvanları | `self_only` |

## Şube ve Tenant Kısıtları

Tüm permission'lar için iki temel kapsam flag'i:

- **`tenant_scope: required`** — Permission yalnızca aktif
  oturumun `tenant_id`'si içinde geçerlidir. Cross-tenant erişim
  denemeleri uygulama katmanında 404 döner.
- **`branch_scope: required`** — Permission yalnızca aktif
  oturumun `branch_id`'si içinde geçerlidir.
- **`self_only: true`** — Permission yalnızca oturum
  kullanıcısının kendi kaydına aittir (portal için zorunlu).

Detaylar için [`ROLE_DESCRIPTIONS.md`](./ROLE_DESCRIPTIONS.md)
veya [`PERMISSION_CATALOG.yaml`](./PERMISSION_CATALOG.yaml)
`summary` bölümüne bakın.

## Ekleme kuralı (CI kapısı)

Yeni permission eklenirken:

1. `PERMISSION_CATALOG.yaml`'a yeni permission ekle.
2. `PERMISSION_MATRIX.md`'de ilgili modül tablosuna satır ekle.
3. `ROLE_DESCRIPTIONS.md`'de rol sorumluluklarını güncelle.
4. Backend'de `@Permission('domain:resource:action')` dekoratörü
   ile kullan (GOAL-012 RBAC altyapısı).
5. Frontend'de `hasPermission(...)` ile UI görünürlüğü kontrol et.
6. `pnpm docs:check` çalıştır; CI'da katalog ile senkronizasyon
   doğrulanır.

## Üretim sürümü

- **GOAL-002 (FAZ-0)** ile birlikte üretildi (2026-07-30).
- Toplam: 113 permission, 5 rol, 28 modül.
- Sonraki goal'lar (GOAL-010+ Tenant, GOAL-011 Auth, GOAL-012
  RBAC) bu katalog üzerine kod inşa eder.

## İlgili dokümanlar

- `../domain/DOMAIN_GLOSSARY.md` — varlık/kavram sözlüğü
  (18 varlık, bu katalogdaki permission'ların resource_type'ları).
- `../domain/CLINICAL_FLOWS.md` — uçtan uca iş akışları (her
  akış için kullanılan permission'lar).
- `../ai/AI_KNOWLEDGE_BASE.md` — RAG chunk yapısı.
- `../../PROJECT_CONTEXT.md` — ürün vizyonu, faz durumu.
- `../../goals/GOAL-002_COMPLETION_REPORT.md` — tamamlanma raporu.
