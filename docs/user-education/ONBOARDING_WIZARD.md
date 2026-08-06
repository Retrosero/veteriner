# İlk Kullanım Asistanı (Onboarding Wizard)

VetNiva'nın ilk kullanım asistanı; kullanıcıların "X nasıl yapılır?" sorularını
yanıtlayan, rol/modül bazlı senaryo eşleştirmesi yapan ve tıbbi sorularda
**yardımcı olmayı reddeden** sihirbaz. Tasarım: **LLM yok**, template-based;
teşhis/tedavi/doz ASLA üretmez.

## 4 adım

1. **Karşılama + Rol Seçimi** — Kullanıcı rolünü seçer (Veteriner, Klinik
   Personeli, İşletme Sahibi, Hasta Sahibi Portalı).
2. **Senaryo Listesi** — Seçilen role göre filtrelenmiş senaryolar listelenir.
   Kullanıcı doğrudan bir senaryoya tıklayabilir.
3. **Soru** — Kullanıcı serbest metin olarak "X nasıl yapılır?" yazabilir.
   Backend substring + word-prefix eşleşmesi (4+ char, TR/EN) yapar.
4. **Sonuç + Navigasyon** — Eşleşen senaryo gösterilir, adımlar + sayfa linki.
   Tıbbi sorularda özel reddi mesajı gösterilir.

## Tıbbi reddi (medical refusal)

Tıbbi kategorideki sorular (tanı, tedavi, doz) otomatik reddedilir:

- **Tanı**: "X hastalığı mı?", "ne teşhis edilir?"
- **Tedavi**: "X nasıl tedavi edilir?"
- **Doz**: `<rakam>+birim` regex'i (örn. "5mg/kg", "10ml")

UI aynı mesajı gösterir:

> "Bu asistan tıbbi sorularda (tanı, tedavi, doz) yardımcı olamaz. Lütfen
> veteriner hekiminize danışın."

## Tetikleyici eşleşmesi

Backend 4+ karakterlik kelimeler üzerinde substring + word-prefix araması
yapar. Örneğin "aşı nasıl yapılır?" sorgusu → "aşı" tetikleyicisi içeren tüm
senaryoları döner (skor sıralı).

## Sayfa bonusu (currentPage)

Kullanıcı `/tr-TR/patients` sayfasındayken soru sorduğunda, backend
`currentPage` parametresinden sayfa bağlamını alır ve ilgili modülün
senaryolarını önceliklendirir.

## Mimari

- **Backend** (`apps/api/src/modules/onboarding/`): `OnboardingService` +
  `OnboardingController`. 2 endpoint: `GET /api/v1/onboarding/scenarios`,
  `POST /api/v1/onboarding/ask`. 10 senaryo (hasta sahibi/hasta/randevu/aşı/
  stok/petshop/tahsilat/lab/portal/superadmin). 24/24 test.
- **Frontend** (`apps/web/src/components/onboarding/onboarding-wizard.tsx`):
  4 adımlı wizard, i18n (tr-TR/en-GB), erişilebilir (klavye, ARIA).
- **API client** (`apps/web/src/lib/onboarding-client.ts`): `apiRequest`
  üzerinden ince sarmalayıcı; X-Request-Id korelasyonu otomatik.

## Veri

Senaryolar kaynak kodda statik (OnboardingService); DB migration gerekmez.
İçerik operasyonel ekip tarafından güncellenir; güncelleme için PR açılır.

## Erişilebilirlik

- Step navigation: klavye Tab/Enter
- ARIA: `aria-current="step"`, `role="dialog"`, `aria-modal="true"`
- Skor sıralı: en iyi eşleşen senaryo ilk
- Loading + empty + error state'leri ayrı ayrı

## Sınırlamalar

- **Çevrimdışı değil**: API'ye bağımlı
- **Tıbbi red mutlaktır**: doz/tanı/tedavi ASLA üretilmez (KVKK + etik)
- **Senaryo statik**: kullanıcı geri bildirimi şu an toplanmıyor (FAZ-12+)

## İlgili dokümanlar

- `docs/pages/web.app.locale.onboarding.yaml` — sayfa envanteri
- `apps/api/src/modules/onboarding/onboarding.service.ts` — backend
- `apps/web/src/components/onboarding/onboarding-wizard.tsx` — frontend

## Sürüm

- v1.0 — 2026-08-05 (FAZ-11 GOAL-117 tick 2)
