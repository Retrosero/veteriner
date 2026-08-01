# GOAL-117 — İlk Kullanım Asistanı (Completion Report)

## Faz

FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet

Uygulama kullanımına yönelik ilk kullanım asistanı (onboarding
assistant). "X nasıl yapılır?" sorusunu role + modül + anahtar
kelime bazlı senaryo eşleştirmesi ile yanıtlar. Tıbbi sorular
(tanı/teşhis/ilaç/doz) reddedilir. Yalnızca uygulama kullanımı
içindir; LLM entegrasyonu Faz 12+'da bu katmanı değiştirecek.

## Çıktılar

### Core (GOAL-117 core commit `50b7083` + `ad606f0`)

- `apps/api/src/common/onboarding/onboarding.types.ts` —
  `OnboardingAskInput`, `OnboardingAskResponse`,
  `OnboardingScenarioListResponse`, `OnboardingRole`,
  `OnboardingScenario` tipleri + Zod şemaları.
- `apps/api/src/common/onboarding/onboarding.service.ts`:
  - `listScenarios(role, enabledModules)` — role + modül
    filtresi.
  - `ask(input, actor)` — soru eşleştirme + senaryo adımları.
  - `detectMedicalRefusal(question)` — tıbbi soru tespiti
    (regex tabanlı; LLM tabanlı Faz 12+'da).
- `apps/api/src/common/onboarding/onboarding.module.ts` —
  DI provider.
- `apps/api/src/common/onboarding/onboarding.service.spec.ts`
  — unit testler.
- `apps/api/src/modules/onboarding/onboarding.controller.ts`
  — 2 endpoint.
- `apps/api/src/modules/onboarding/onboarding.module.ts`.

### Endpoint'ler (2)

| #   | Method | Path                           | Yetki  |
| --- | ------ | ------------------------------ | ------ |
| 1   | POST   | `/api/v1/onboarding/ask`       | Oturum |
| 2   | GET    | `/api/v1/onboarding/scenarios` | Oturum |

### Döküman (bu commit)

- 2 API doc (ask, scenarios).
- `docs/pages/` — onboarding sayfası kataloğu (planlanan).

## İş Kuralları

- **Senaryo eşleştirmesi:** `OnboardingService.ask()` soru +
  role + modül + anahtar kelimeye göre workflow kataloğundan
  (`docs/workflows/*.md`) en uygun senaryoyu seçer.
- **Role filtreleme:** Aktörün rolü ne ise yalnızca o role
  uygun senaryolar döner. SUPERADMIN tüm senaryoları görür.
- **Modül filtresi:** `?modules=clinic,vaccinations` ile
  senaryo araması daraltılabilir.
- **Tıbbi red:** Tanı/teşhis/ilaç/doz soruları
  `detectMedicalRefusal()` ile tespit edilir ve 422
  `VET-ONBOARD-0001` ile reddedilir; kullanıcıya "veteriner
  hekiminize danışın" mesajı gösterilir.
- **PII taşımaz:** Yalnızca public sayfa yolu + buton adı
  döner; asla hasta adı, TCKN, telefon vb. içermez.
- **Audit:** `audit:onboarding.ask` (info),
  `audit:onboarding.scenarios_list` (info).

## Yapılmayanlar / Bilinçli Atlamalar

- **LLM entegrasyonu (OpenAI/Anthropic)** → Faz 12+ (regex
  yerine LLM tabanlı senaryo eşleştirmesi).
- **Çoklu-dil (en-GB) senaryolar** → Faz 14+ (en-GB
  workflow'lar).
- **Konuşma hafızası (multi-turn)** → Faz 13+.
- **Görsel walkthrough (video)** → Faz 12+.
- **Tooltip / on-page highlight** → Faz 12+ (Next.js
  client component).

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `onboarding.service.spec.ts` → unit testler.
- Full api regresyon: 1439+ yeşil, 9 skipped, 0 hata.

## Commit

- Core: `50b7083` — `GOAL-117 core: ilk kullanım asistanı`
- Docs: (bu commit) — `docs(onboarding): GOAL-117 ilk kullanım asistanı doküman`
