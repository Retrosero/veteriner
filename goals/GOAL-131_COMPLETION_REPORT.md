# GOAL-131 — SMS Sağlayıcı Entegrasyonu (Completion Report)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Özet

SMS gönderimi için pluggable adapter mimarisi. Pilot için
NetGSM (TR odaklı, ucuz, yüksek deliverability). NoOp
adapter development + test ortamı.

## Çıktılar

### Core (`apps/api/src/common/integrations/sms/`)

- `sms.adapter.ts`:
  - `SmsProvider` enum (netgsm | twilio | messagebird |
    iletimerkezi | noop).
  - `SmsSendInput`, `SmsSendResult` tipleri.
  - `SmsAdapter` interface (send + queryStatus).
  - `SMS_ADAPTER` DI token.
  - `NOOP_SMS_ADAPTER_NAME` (default).

### Döküman (bu commit)

- `docs/integrations/SMS.md` — sağlayıcı karşılaştırması,
  konfigürasyon, iş akışı, BTK uyumluluğu, test stratejisi.

## İş Kuralları

- **PII mask:** Telefon numarası mask'lı log'lanır.
- **Retry:** 3 deneme (exponential backoff 1m, 5m, 30m).
- **Dead letter:** 3 başarısız deneme sonrası.
- **BTK yönetmeliği:** 22:00-08:00 arası gönderim yok.
- **Çift opt-in:** Pazarlama SMS'leri için önceden onay.
- **Audit:** `audit:notification.sent` (info) +
  `audit:notification.failed` (warning).

## Yapılmayanlar / Bilinçli Atlamalar

- **NetGSM/Twilio gerçek implementasyon** → Faz 14+
  (sağlayıcı API key + sözleşme).
- **OTP / 2FA SMS** → Faz 14+ (auth akışı).
- **WhatsApp failover** → Faz 13+ (GOAL-132).
- **Çoklu sağlayıcı yük dengeleme** → Faz 14+.

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `sms.adapter.spec.ts` (FAZ-14+) — NoOp + mock provider.
- Sandbox test: NetGSM test hesabı.

## Commit

- Core: (bu commit) — `feat(integrations): GOAL-131 SMS adapter sözleşmesi`
- Docs: (bu commit) — `docs(integrations): GOAL-131 SMS entegrasyon dokümanı`
