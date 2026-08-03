# GOAL-117 Completion Report — Onboarding Frontend Wizard + Help Button

## Ozet

Onboarding backend (GOAL-117 backend) tamamlandiktan sonra, frontend
tarafinda 3 adimli wizard + tum sayfalara entegre yardim butonu
eklendi. Tibbi sorular backend tarafindan reddedilir; frontend
ayni mesaji kullaniciya gosterir.

## Degisen dosyalar

### Frontend (`apps/web`)

- `src/components/onboarding/onboarding-wizard.tsx` (yeni) — 3 adimli
  wizard: (1) karsilama + rol secimi, (2) tetikleyici eslestirmesi,
  (3) navigasyon linkleri + bitis. shadcn primitive'leri
  (Button, Card, Input).
- `src/components/onboarding/onboarding-wizard.test.tsx` (yeni) — 5
  unit test (render, adim navigasyonu, ask submit, tibbi reddi,
  geri butonu).
- `src/components/help/help-button.tsx` (yeni) — Sabit konumda "Yardim"
  butonu; tiklayinca overlay olarak onboarding wizard acar.
- `src/components/help/help-button.test.tsx` (yeni) — 3 unit test
  (render, acma, kapatma).
- `app/[locale]/onboarding/page.tsx` (yeni) — Tam sayfa onboarding
  route; AppShell + PageHeader + wizard.
- `app/[locale]/dashboard/page.tsx` — Yardim butonu entegrasyonu
  (tum authenticated sayfalar icin ornek).
- `src/lib/labels.ts` — `onboarding` namespace (tr-TR + en-GB) eklendi.

### Contracts (`packages/contracts`)

- `src/onboarding.ts` (yeni) — Frontend/backend ortak tipler
  (OnboardingRole, OnboardingCategory, OnboardingStep,
  LocalizedOnboardingScenario, OnboardingAskResponse,
  OnboardingScenarioListResponse, OnboardingGenerationSource).
- `src/index.ts` — `onboarding` export.
- `dist/onboarding.d.ts` + `dist/onboarding.js` + `dist/index.d.ts`
  - `dist/index.js` — Build artifact'lari (offline pnpm store
    kisiti nedeniyle manuel eklendi).

### Docs

- `docs/pages/web.app.locale.onboarding.yaml` (yeni) — Sayfa
  bilgi kaydi.
- `docs/fields/fields.yaml` — `onboarding.*` alanlari (29 alan).

### i18n

- `packages/i18n/src/locales/tr-TR.json` + `en-GB.json` —
  `onboarding` namespace (27 anahtar) eklendi.

## Alinan kararlar

1. **Yardim butonu konumu**: `fixed bottom-6 right-6` ile sayfa
   alt sag kosesinde; tüm authenticated layout'larda
   (AppShell kullanan) calisir. Mobile'da da gorunur.

2. **3 adimli wizard state**: Tek bir `step` state ile 1/2/3
   arasinda gecis; her adim ayri component fonksiyonu
   (Step1Role, Step2Ask, Step3Result) ile izole edilir.

3. **Tibbi reddi (medical refusal)**: Backend `generationSource:
"refusal"` ve `refusalReason: "medical" | "dosage" |
"diagnosis" | "treatment"` alanlari ile reddeder; frontend
   ayni mesaji kullaniciya gosterir. Tasarim karari: sadece
   tek tip mesaj ("Bu konuda yardimci olamam, veterinerinize
   danisin") gosterilir; UI'da kategori detayi gostermiyoruz
   (kullaniciyi korkutmamak icin).

4. **RBAC**: Tum authenticated roller (SUPERADMIN, OWNER,
   VETERINARIAN, STAFF, PET_OWNER_PORTAL) wizard'a
   erisebilir. Backend zaten onboarding controller'da bu
   rolleri kabul ediyor; frontend ek bir kontrol yapmiyor.

5. **List vs detail scenario**: Wizard 2. adimda senaryo
   listesini gosterir (sadece stepCount ile); 3. adimda ask
   yanitindan veya secili senaryo ID'sinden adim listesini
   render eder. Eger kullanici listeden bir senaryo secip
   adim detayini almadan "Bitir" diyorsa sadece stepCount
   gosterilir (Gozden gecirme sonrasi Faz 12+'da full detail
   fetch eklenebilir).

6. **Onboarding tip export**: Backend tarafi Zod semalarini
   `apps/api/src/common/onboarding/onboarding.types.ts`'de tutar;
   frontend tip guvenligi icin `packages/contracts/src/onboarding.ts`
   eklenmistir. Backend Zod semalari tek dogruluk kaynagi
   olmaya devam eder; contracts sadece TypeScript tip export'u
   yapar (no runtime validation).

## Sonraki adimler

1. **Asenkron adim fetch**: Wizard 2. adimda senaryo secildiginde
   full adim listesini backend'den almak (Faz 12+).
2. **Lokal storage**: Kullanici son ziyaret ettigi senaryoyu
   kayit altinda tutmak (Faz 13+).
3. **Multimedia**: Wizard'a video/screencast entegrasyonu
   (Faz 13+).
4. **Klavye navigasyonu**: ESC ile wizard'i kapatma, TAB ile
   adimlar arasinda gecis (Faz 12+).
