# GOAL-130 — e-SMM Gerçek Entegrasyonu (Completion Report)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Özet

FAZ-7'deki mock e-SMM adapter (GOAL-077) için gerçek
sağlayıcı entegrasyonu altyapısı. Adapter sözleşmesi
FAZ-7'deki `EsmmAdapter` interface'i ile uyumlu; pilot
için Logo İşbaşı önerildi.

## Çıktılar

### Döküman (bu commit)

- `docs/integrations/ESMM.md` — sağlayıcı seçimi
  (Logo, Paraşüt, Gİb), adapter sözleşmesi, iş akışı,
  konfigürasyon, Gİb uyumluluğu, test stratejisi.

### Provider Seçimi

- **Pilot için:** Logo İşbaşı.
- **Alternatifler:** Paraşüt, Gİb e-Fatura.gov.tr.
- **Mock (FAZ-7):** development + test ortamı.

## İş Kuralları

- `EsmmAdapter` interface'i değişmedi; provider
  implementasyonu değişir.
- Webhook: HMAC imza doğrulama + retry 3x exponential.
- Belge formatı: UBL-TR (XAdES imzalı, provider tarafı).
- Saklama: 5 yıl (Vergi Usul Kanunu).

## Yapılmayanlar / Bilinçli Atlamalar

- **Real provider implementasyonu** → Faz 14+ (sağlayıcı
  anlaşması + test hesabı).
- **e-Fatura, e-Arşiv, e-İrsaliye** → Faz 14+ (ayrı
  adapter'lar).
- **Gİb e-Fatura özel entegrasyon** → Faz 14+ (Gİb API
  ayrı sözleşme).

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `esmm.service.spec.ts` (FAZ-7) — mock provider ile.
- Sandbox test (FAZ-14+) — Logo test hesabı ile.

## Commit

- Docs: (bu commit) — `docs(integrations): GOAL-130 e-SMM gerçek entegrasyon dokümanı`
