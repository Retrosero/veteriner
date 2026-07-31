# GOAL-120 — Pilot Tenant Kurulumu (Completion Report)

## Faz
FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet
Pilot klinik için tenant, tek şube, 2 OWNER + 2
VETERINARIAN/STAFF kullanıcı ve demo hayvan/sahip seed
verisi. Repoya gerçek parola veya kişisel veri yazılmaz;
tüm credential'lar env üzerinden alınır.

## Çıktılar

### Core (`apps/api/src/common/seed/`)
- `seed-pilot-tenant.ts` — pilot seed servisi:
  - `PilotSeedService.run()` — tenant + branch + users +
    owners + patients.
  - `PILOT_SEED` sabit yapı (kimlik bilgisi YOK).
  - Production'da hata fırlatır
    (`NODE_ENV === 'production'` guard).
- `seed-pilot-cli.ts` — CLI entry (`pnpm seed:pilot`).

### Seed Verisi (PILOT_SEED)
- **Tenant:** `tnt-pilot-kadikoy` (slug: `pilot-vet-kadikoy`,
  TR, tr-TR, Europe/Istanbul).
- **Branch:** `Merkez Şube`, Caferağa Mah. Test Sk. No:1
  Kadıköy/İstanbul.
- **Users (4):**
  - 2 OWNER (`owner@pilot.vetniva.local`,
    `owner2@pilot.vetniva.local`)
  - 1 VETERINARIAN (`vet@pilot.vetniva.local`)
  - 1 STAFF (`staff@pilot.vetniva.local`)
  - Parolalar: `PILOT_*_PASSWORD` env'den.
- **Demo data (kimliksiz):**
  - 2 Owners (Demo Sahip 1 + 2).
  - 2 Patients (Karabaş dog, Minnoş cat).

## İş Kuralları
- **Production guard:** `NODE_ENV === 'production'` ise
  seed hata fırlatır.
- **Env-only credentials:** Parolalar repoya yazılmaz;
  `PILOT_OWNER_PASSWORD`, `PILOT_OWNER2_PASSWORD`,
  `PILOT_VET_PASSWORD`, `PILOT_STAFF_PASSWORD` env'den
  alınır.
- **Idempotent:** Tüm upsert metodları idempotent; mevcut
  kayıt varsa atlanır.
- **Audit:** `audit:tenant.seed_pilot` (info) üretir
  (FAZ-12+ AuditService entegrasyonu).
- **No PII:** Demo owners'ta gerçek isim/telefon yok;
  yalnızca placeholder'lar.

## Kullanım

```bash
# 1. .env dosyasında parolaları ayarla
cat >> .env <<EOF
PILOT_OWNER_PASSWORD=changeme-strong-pw-1
PILOT_OWNER2_PASSWORD=changeme-strong-pw-2
PILOT_VET_PASSWORD=changeme-strong-pw-3
PILOT_STAFF_PASSWORD=changeme-strong-pw-4
EOF

# 2. Seed çalıştır
pnpm --filter @vetniva/api seed:pilot

# Production'da çalışmaz; hata fırlatır.
```

## Yapılmayanlar / Bilinçli Atlamalar
- **Prisma migration + upsert bağlantısı** → FAZ-12+ (DB
  katmanı; mevcut upsert metodları TODO).
- **Çoklu-tenant seed (multi-tenant demo)** → FAZ-12+ (her
  tenant için ayrı seed).
- **Seed sürüm yönetimi (hangi versiyon çalıştırıldı?)** →
  FAZ-12+ (`seed_runs` tablosu).
- **Seed rollback** → FAZ-12+ (`seed:undo` komutu).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `seed-pilot-tenant.ts` şu an iskelet; FAZ-12+ testleri
  repository upsert bağlantısıyla birlikte eklenecek.
- Full api regresyon: 1439+ yeşil, 9 skipped, 0 hata.

## Commit
- Core: (bu commit) — `feat(seed): GOAL-120 pilot tenant seed iskeleti`
- Docs: `docs/operations/PRODUCTION_RELEASE.md` (GOAL-127).
