# GOAL-117 — Onboarding Wizard Polish Hazırlık Raporu

**Tarih:** 2026-08-06
**Durum:** 15/15 onboarding testi geçti, kod sağlam; küçük polish
önerileri listelendi.

## Mevcut Durum

Onboarding wizard + help button + onboarding client tamamlandı
(GOAL-117 completion raporu). 3 adımlı wizard, role-bazlı filtre,
tıbbi soru reddi, sözleşme/backend entegrasyonu çalışıyor.

## Test Sonuçları

| Test Dosyası | Test Sayısı | Durum |
| --- | --- | --- |
| `onboarding-wizard.test.tsx` | 5 | ✅ |
| `onboarding-client.test.ts` | 7 | ✅ |
| `help-button.test.tsx` | 3 | ✅ |
| **Toplam** | **15** | **✅ 15/15** |

## Dosya Yapısı

```
apps/web/src/components/onboarding/
  onboarding-wizard.tsx        (709 satır — 3 adım + state)
  onboarding-wizard.test.tsx   (5 test)
apps/web/src/lib/
  onboarding-client.ts         (78 satır — API istemcisi)
  onboarding-client.test.ts    (7 test)
apps/web/src/components/help/
  help-button.tsx              (FAB tarzı sabit buton)
  help-button.test.tsx         (3 test)
apps/web/app/[locale]/onboarding/
  page.tsx                     (tam sayfa wizard route)
```

## Polish Önerileri (küçük UX/a11y iyileştirmeleri)

### 1. Erişilebilirlik (a11y)

- **ESC tuşu ile wizard kapatma** — şu an sadece X butonu veya
  overlay backdrop tıklaması. `onKeyDown` + `Escape` handler'ı
  eklenebilir.
- **Focus trap** — wizard açıkken Tab navigasyonu wizard
  içinde kalmalı (modal pattern). `focus-trap.tsx`
  zaten mevcut (`apps/web/src/components/superadmin/focus-trap.tsx`),
  genelleştirilebilir.
- **ARIA labels** — step indicator'a `aria-current="step"`
  eklenebilir; ilerleme çubuğu için `role="progressbar"`.
- **Reduced motion** — `prefers-reduced-motion` için
  transition kapatma.

### 2. Görsel Polish

- **Step indicator (1/3, 2/3, 3/3)** — şu an sadece
  "Adım 1/3" yazıyor; görsel bir progress bar (1/3 doldurulmuş)
  daha iyi UX verir.
- **Empty state illustration** — "no match" durumunda küçük
  bir ikon/illüstrasyon eklenebilir.
- **Loading skeleton** — API çağrısı sırasında shimmer/skeleton
  (mevcut `loading` string yerine).
- **Mobile responsive** — 3 adım layout'u mobilde dikey
  stack olmalı (şu an sadece test edilen desktop).

### 3. Davranış Polish

- **Wizard state persist** — kullanıcı sayfayı yenilediğinde
  adım 1'den başlamamalı; localStorage ile step saklanabilir.
- **Auto-dismiss** — 30 saniye inaktiflik sonrası wizard
  kendiliğinden kapansın (FAB tekrar açar).
- **Keyboard shortcuts** — `?` tuşu ile yardım wizard'ı aç.
- **First-time user detection** — `localStorage.onboardingCompleted`
  yoksa ilk login'de otomatik wizard göster.

### 4. Backend Polish (eşleşen)

- **API rate limit** — `/api/v1/onboarding/ask` için
  dakikada 30 istek (spam önleme).
- **Telemetry** — hangi senaryo en çok tetikleniyor? (anonim).
- **Scenario versioning** — `v1`, `v2` ile senaryo güncellemeleri.
- **WebSocket push** — yeni senaryo eklendiğinde client cache invalidate.

## Öncelik Sırası (polish sprint)

Yukarıdaki öneriler 4 kategoride. Production-ready öncesi
minimum polish:

1. **a11y (1. madde)** — 1 gün
   - ESC + focus trap + ARIA labels
   - reduced motion desteği
2. **Görsel (2. madde)** — 0.5 gün
   - Step indicator + skeleton loader
3. **Davranış (3. madde)** — 1 gün
   - localStorage persist + auto-dismiss
4. **Backend (4. madde)** — 1.5 gün
   - rate limit + telemetry + versioning

**Toplam:** ~4 iş günü (1 kişi, FAZ-12+ devamı).

## Yapılmayanlar / Bilinçli Atlamalar

- **Çoklu dil wizard (i18n)** — tr-TR + en-GB mevcut, diğer
  diller pilot kapsamı dışı.
- **Video tutorial entegrasyonu** — YouTube/Vimeo embed,
  production-ready sonrası.
- **Interaktif simülasyon** — Kullanıcının gerçek veriyle
  wizard'ı test etmesi (FAZ-13+).
- **AI destekli öneri** — Kullanıcı rolüne göre kişiselleştirilmiş
  senaryo (FAZ-13+).
- **Onboarding analytics dashboard** — SUPERADMIN panel'de
  metrikler (FAZ-13+).

## Pilot Veride Test Senaryoları

Pilot'ta (`pilot-vet-kadikoy`) 4 demo user ile wizard test edilebilir:

1. `owner@pilot.vetniva.local` → "OWNER" rolü ile başla,
   "Faturayı nasıl oluştururum?" sorusu → fatura oluşturma
   senaryosu.
2. `vet@pilot.vetniva.local` → "VETERINARIAN" rolü ile başla,
   "Muayene nasıl kaydedilir?" → SOAP senaryosu.
3. `staff@pilot.vetniva.local` → "STAFF" rolü ile başla,
   "Randevu nasıl oluşturulur?" → takvim senaryosu.
4. Tıbbi soru: "Köpekte parvovirüs dozu nedir?" → refusal
   (VET-MEDICAL-REFUSAL) + restart.

## Takip Öğeleri (production-ready öncesi)

1. **A11y polish** (ESC, focus trap, ARIA, reduced motion).
2. **Step indicator + skeleton** (görsel polish).
3. **localStorage state persist** (UX polish).
4. **Backend rate limit + telemetry** (operasyonel).
5. **Pilot kullanıcı testi** (4 demo user ile).
6. **Onboarding completion metric** (admin dashboard).
