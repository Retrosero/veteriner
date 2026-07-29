# Yetki Matrisi

Bu matris, VetNiva'nın tüm permission anahtarlarını ve rollere göre
dağılımını listeler. Format: `<domain>:<resource>:<action>` (ör.
`clinic:patient:read`).

`pnpm docs:check` CI kapısı, kodda kullanılan permission referanslarının
bu matriste yer almasını zorunlu kılar.

## Roller (Pilot)

- `OWNER` — işletme sahibi; tenant'ın tüm verisine erişir
- `VETERINARIAN` — veteriner hekim; klinik modüllerinde tam yetki
- `STAFF` — klinik personeli; sınırlı yetki (POS, kabul, hasta sahibi yönetimi)
- `SUPERADMIN` — VetNiva platform yönetimi (tenant dışı görünüm)
- `PET_OWNER_PORTAL` — hasta sahibi portalı kullanıcısı (yalnızca kendi hayvanları)

## Genel (COMMON)

| Permission                 | OWNER | VETERINARIAN | STAFF | SUPERADMIN | PET_OWNER_PORTAL |
| -------------------------- | :---: | :----------: | :---: | :--------: | :--------------: |
| `common:notification:read` |   ✓   |      ✓       |   ✓   |     ✓      |        ✓         |
| `common:profile:read`      |   ✓   |      ✓       |   ✓   |     ✓      |        ✓         |
| `common:profile:update`    |   ✓   |      ✓       |   ✓   |     ✓      |        ✓         |

## Klinik (CLINIC) — GOAL-002+

| Permission               | OWNER | VETERINARIAN | STAFF | SUPERADMIN | PET_OWNER_PORTAL |
| ------------------------ | :---: | :----------: | :---: | :--------: | :--------------: |
| `clinic:owner:read`      |   ✓   |      ✓       |   ✓   |     —      |        —         |
| `clinic:owner:create`    |   ✓   |      ✓       |   ✓   |     —      |        —         |
| `clinic:owner:update`    |   ✓   |      ✓       |   ✓   |     —      |        —         |
| `clinic:owner:archive`   |   ✓   |      ✓       |   —   |     —      |        —         |
| `clinic:patient:read`    |   ✓   |      ✓       |   ✓   |     —      |    ✓ (kendi)     |
| `clinic:patient:create`  |   ✓   |      ✓       |   ✓   |     —      |        —         |
| `clinic:patient:update`  |   ✓   |      ✓       |   ✓   |     —      |        —         |
| `clinic:patient:archive` |   ✓   |      ✓       |   —   |     —      |        —         |

## Aşı (VACCINATION) — GOAL-003

| Permission                  | OWNER | VETERINARIAN | STAFF | SUPERADMIN | PET_OWNER_PORTAL |
| --------------------------- | :---: | :----------: | :---: | :--------: | :--------------: |
| `clinic:vaccination:read`   |   ✓   |      ✓       |   ✓   |     —      |    ✓ (kendi)     |
| `clinic:vaccination:create` |   ✓   |      ✓       |   —   |     —      |        —         |
| `clinic:vaccination:amend`  |   ✓   |      ✓       |   —   |     —      |        —         |

## Petshop (PETSHOP) — Faz 6+

(İleride doldurulacak.)

## Ekleme kuralı

1. Bu matrise satır ekle.
2. Backend'de `@Permission('domain:resource:action')` dekoratörü ile
   kullan (veya eşdeğer mekanizma).
3. Frontend'de `hasPermission(...)` ile UI görünürlüğü kontrol et.
4. `pnpm docs:check` çalıştır.
