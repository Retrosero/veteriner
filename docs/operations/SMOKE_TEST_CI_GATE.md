# VetNiva Smoke Test CI Gate (GOAL-127)

**Tarih:** 2026-08-06
**Faz:** FAZ-12 (Production release ve rollback)
**Hedef:** Pilot ve production deploy sonrası 9 adımlık smoke test
paketini GitHub Actions üzerinden otomatik çalıştırmak.
**İlgili workflow:** `.github/workflows/smoke-test.yml`
**İlgili spec dizini:** `apps/web/e2e/smoke/`

## 1. Amaç

GOAL-127 "production release sonrasında smoke testleri otomatik
çalıştır" gereği, pilot (`https://vetniva.appsgo.cloud/`) ve ileride
production URL'leri için tarayıcı tabanlı bir gate eklenmiştir.
Mevcut CI (`ci.yml`) yalnızca lint / type-check / unit / e2e
backend testlerini çalıştırır; bu yeni gate canlıya çıkmış
sistemin uçtan uca çalıştığını doğrular.

## 2. Kapsam

Smoke test paketi 5 spec dosyası ve 9 senaryodan oluşur:

| #   | Spec                    | Senaryo                              | Bağımlı user   |
| --- | ----------------------- | ------------------------------------ | -------------- |
| 1   | `health.spec.ts`        | Landing 200 + `/api/v1/health` 200   | —              |
| 2   | `login.spec.ts`         | 4 demo user login + role-based menü  | tümü           |
| 3   | `clinical-flow.spec.ts` | Tam klinik döngü + onboarding wizard | vet + owner    |
| 4   | `auth-errors.spec.ts`   | 401 / 403 / 404                      | staff + vet    |
| 5   | `audit.spec.ts`         | Cross-tenant + audit trail           | owner + owner2 |

Senaryo detayları için `docs/operations/PILOT_SMOKE_TEST_PLAN.md`
referans alınmıştır.

## 3. Tetikleyiciler

### 3.1 Manuel (`workflow_dispatch`)

GitHub Actions sekmesinden "Smoke Test (Pilot / Production)"
workflow'u "Run workflow" ile manuel tetiklenir. UI'dan üç
parametre ayarlanabilir:

- `base_url`: Hedef URL (varsayılan: pilot)
- `browser`: chromium / firefox / webkit (varsayılan: chromium)
- `spec_filter`: Playwright `--grep` filtresi (örn. `^2\\. Login`)

### 3.2 Deploy hook (`repository_dispatch`)

Coolify webhook'u veya harici CI, GitHub API üzerinden
`repository_dispatch` event'i yayınlar:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{
    "event_type": "production-deploy",
    "client_payload": { "base_url": "https://vetniva.com.tr" }
  }'
```

Desteklenen `event_type` değerleri: `production-deploy`,
`pilot-deploy`. `client_payload.base_url` opsiyoneldir; yoksa
pilot default kullanılır.

## 4. Çalıştırma Adımları

Workflow 5 dakika zaman aşımı ile Ubuntu üzerinde çalışır.
Sırasıyla:

1. `actions/checkout@v4` ile kaynak çekilir.
2. `pnpm/action-setup@v4` + `actions/setup-node@v4` ile Node 20
   pnpm 9.15.9 kurulur; pnpm store cache restore edilir.
3. `pnpm install --frozen-lockfile` ile monorepo bağımlılıkları
   kurulur.
4. Playwright tarayıcı cache anahtarı
   `smoke-pw-<os>-<PLAYWRIGHT_VERSION>` ile restore edilir;
   yoksa `pnpm dlx @playwright/test@1.49.1 install --with-deps
chromium` indirir.
5. `pnpm dlx @playwright/test@1.49.1 test` senaryoları
   çalıştırır (`apps/web/playwright.config.ts`).
6. HTML rapor (`playwright-report/`) + test-results
   (`test-results/`) artifact olarak yüklenir (14 gün retention).
7. Hata durumunda `SMOKE_WEBHOOK_URL` secret'ı tanımlıysa
   Slack/Discord'a kısa bildirim gönderilir.

## 5. Bağımlılık Yönetimi — Yeni Paket Eklenmez

`apps/web` ve monorepo `package.json` dosyalarına **yeni
bağımlılık eklenmemiştir**. Playwright, workflow içinde
`pnpm dlx @playwright/test@1.49.1` ile çalışma zamanında
indirilir. Bu yaklaşım:

- `apps/web/package.json` boyutunu şişirmez.
- CI install süresini etkilemez (sadece smoke job çalıştığında
  indirilir).
- Tek doğruluk kaynağı: workflow'taki `PLAYWRIGHT_VERSION`
  environment değişkeni.

`@playwright/test` türleri `apps/web/e2e/**` ve
`apps/web/playwright.config.ts` için `tsconfig.json` +
`eslint.config.mjs` üzerinden **devre dışı bırakılmıştır**;
bu yüzden lokal `pnpm type-check` ve `pnpm lint` görevleri
bu dosyalardan etkilenmez.

## 6. Smoke Test Verisi (Pilot)

Smoke test çalıştırması pilot tenant verisini paylaşır. Pilot
ortamı tek tenant'lıdır (`pilot-vet-kadikoy`); 4 demo user ve 2
hasta seed edilmiştir. Detaylar `apps/web/e2e/smoke/helpers.ts`
içinde sabit olarak tutulur:

```ts
DEMO_USERS = [
  {
    email: "owner@pilot.vetniva.local",
    password: "VetNiva-Owner-2026!",
    role: "OWNER",
  },
  {
    email: "vet@pilot.vetniva.local",
    password: "VetNiva-Vet-2026!",
    role: "VETERINARIAN",
  },
  {
    email: "staff@pilot.vetniva.local",
    password: "VetNiva-Staff-2026!",
    role: "STAFF",
  },
  {
    email: "owner2@pilot.vetniva.local",
    password: "VetNiva-Owner2-2026!",
    role: "OWNER",
  },
];

PILOT_PATIENTS = { karabas: { name: "Karabaş" }, minnos: { name: "Minnoş" } };
PILOT_MAROPITANT = { name: "Maropitant", dose: "16mg", tablets: 1 };
```

`clinical-flow.spec.ts` senaryosu pilot verisinde yan etki
oluşturur (muayene + reçete + fatura). Bu nedenle:

- `retries: 0` ayarı sabit (config).
- `workers: 1` ayarı ile sıralı çalışma (config).
- Aynı workflow eş zamanlı çalıştırılmaz (concurrency group).

## 7. Lokal Çalıştırma (Opsiyonel)

Lokal çalıştırma için tarayıcı kurulumu gerekir. Production
gate'inin bir parçası olmamakla birlikte, geliştirme sırasında
hızlı doğrulama için:

```bash
# Chromium indir (yalnızca bir kez)
pnpm dlx @playwright/test@1.49.1 install --with-deps chromium

# Smoke test (default pilot URL)
SMOKE_BASE_URL=https://vetniva.appsgo.cloud/ \
  pnpm dlx @playwright/test@1.49.1 test \
    --config=apps/web/playwright.config.ts

# Sadece login senaryoları
SMOKE_BASE_URL=https://vetniva.appsgo.cloud/ \
  pnpm dlx @playwright/test@1.49.1 test \
    --config=apps/web/playwright.config.ts --grep="^2\\. Login"
```

> Not: `apps/web` paketi `@playwright/test`'i içermediğinden
> `pnpm --filter @vetniva/web test:e2e` script'i tanımsızdır.
> Test çalıştırması her zaman `pnpm dlx` ile yapılır.

## 8. Sorun Giderme

### Tarayıcı binary eksik

`Executable doesn't exist at .../chrome-linux/chrome` hatası:
`pnpm dlx @playwright/test@1.49.1 install --with-deps chromium`
adımını manuel çalıştırın. CI'da cache anahtarı
`smoke-pw-ubuntu-1.49.1` değişmiş olabilir; cache temizlenir.

### Test sonuçları indirilemiyor

Artifact yükleme `if-no-files-found: ignore` ile korunur;
`playwright-report/` dizini oluşmadıysa testler hiç
başlatılamamış olabilir. Actions log'undan "Run smoke tests"
adımının çıktısını inceleyin.

### Yanlış base URL tetiklendi

`repository_dispatch` payload'undaki `base_url` hatalıysa
`workflow_dispatch` ile manuel override edilebilir.

## 9. İlgili Dokümanlar

- `docs/operations/PILOT_SMOKE_TEST_PLAN.md` — Manuel 9 adımlık
  smoke test planı.
- `docs/operations/PRODUCTION_RELEASE.md` — Production release
  prosedürü.
- `goals/GOAL-127_production_release_ve_rollback.md` — Goal
  tanımı.
- `.github/workflows/ci.yml` — Mevcut CI gate'i (bu workflow
  onu DEĞİŞTİRMEZ, eşlik eder).
- `apps/web/playwright.config.ts` — Playwright konfigürasyonu.
- `apps/web/e2e/smoke/` — Spec dosyaları.

## 10. Commit

- `feat(ci): GOAL-127 smoke test GitHub Action (Playwright + 9 senaryo)`
