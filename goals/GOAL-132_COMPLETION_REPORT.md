# GOAL-132 — WhatsApp Entegrasyonu (Completion Report)

## Faz
FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Özet
Meta WhatsApp Business Cloud API için pluggable adapter
mimarisi. Template + text + image + document mesajları
desteklenir.

## Çıktılar

### Core (`apps/api/src/common/integrations/whatsapp/`)
- `whatsapp.adapter.ts`:
  - `WhatsAppMessageType` enum (text | template | image |
    document).
  - `WhatsAppTemplateMessage`, `WhatsAppTextMessage`,
    `WhatsAppMediaMessage` (discriminated union).
  - `WhatsAppSendInput`, `WhatsAppSendResult` tipleri.
  - `WhatsAppAdapter` interface (send + submitTemplate).
  - `WHATSAPP_ADAPTER` DI token.

### Döküman (bu commit)
- `docs/integrations/WHATSAPP.md` — sağlayıcı (Meta Cloud
  API), template örnekleri (appointment_reminder_tr,
  vaccine_due_tr, payment_received_tr, lab_result_ready_tr),
  konfigürasyon, KVKK/BTK uyumluluğu, güvenlik (opt-in/opt-out,
  rate limit).

## İş Kuralları
- **Template onayı:** Meta Business Manager'dan
  (1-24 saat).
- **24 saat pencere:** Kullanıcı son 24 saat içinde
  yazdıysa serbest metin; aksi halde yalnızca template.
- **Opt-in/opt-out:** "dur" komutu → tüm kanallardan çıkış.
- **Audit:** `audit:notification.sent` (info),
  `audit:notification.opt_out` (info).
- **Rate limit:** 100/saniye tenant bazında soft cap.

## Yapılmayanlar / Bilinçli Atlamalar
- **Meta Cloud API gerçek implementasyon** → Faz 14+
  (Meta business verification + 42624 display name
  onayı).
- **Inbox yönetimi (canlı sohbet)** → Faz 14+.
- **Click-to-WhatsApp reklamları** → Faz 14+.

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `whatsapp.adapter.spec.ts` (FAZ-14+) — mock provider.
- Sandbox test: Meta test business hesabı.

## Commit
- Core: (bu commit) — `feat(integrations): GOAL-132 WhatsApp adapter sözleşmesi`
- Docs: (bu commit) — `docs(integrations): GOAL-132 WhatsApp dokümanı`
