# WhatsApp Business API (GOAL-132)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Amaç

Müşteri iletişiminde WhatsApp kanalı. Hatırlatma, randevu
onayı, aşı hatırlatması, tahsilat bildirimi, vb.

## Provider

**Meta WhatsApp Business Cloud API** (`graph.facebook.com/v18.0`).
Türkiye'de WhatsApp Business API kullanımı Meta business
verification + 42624 display name onayı gerektirir.

## Adapter Sözleşmesi

`apps/api/src/common/integrations/whatsapp/whatsapp.adapter.ts`'te
tanımlı. `WhatsAppAdapter` interface'i template + text + image +
document mesajlarını destekler.

## İş Akışı

1. **Template onayı:** Meta Business Manager'dan template
   yüklenir (`submitTemplate`); onay 1-24 saat sürer.
2. **Mesaj gönderimi:** Hasta sahibinin telefonuna template
   ile bildirim.
3. **Webhook (inbound):** Kullanıcı yanıt verirse webhook
   alınır; opt-in/opt-out işlenir.
4. **24 saat pencere:** Kullanıcı son 24 saat içinde yazdıysa
   serbest metin; aksi halde yalnızca template.

## Template Örnekleri

| Template                  | Kategori | Parametreler                   |
| ------------------------- | -------- | ------------------------------ |
| `appointment_reminder_tr` | utility  | `[tarih, saat, veteriner]`     |
| `vaccine_due_tr`          | utility  | `[hayvan_adı, aşı_adı, tarih]` |
| `payment_received_tr`     | utility  | `[tutar, makbuz_no]`           |
| `lab_result_ready_tr`     | utility  | `[hayvan_adı, test_sayısı]`    |

## Provider Konfigürasyonu

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_BUSINESS_ID=xxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=xxx
```

## Türkiye Regülasyonu

- **KVKK:** WhatsApp üzerinden paylaşılan tıbbi veriler için
  açık rıza + ekstra güvenlik (FAZ-12 KVKK kapsamı).
- **BTK:** Pazarlama mesajları için önceden onay.
- **Meta politikaları:** Health/medical kategori kısıtı
  (tıbbi veri gönderimi sınırlı; utility template'ler
  kullanılabilir).

## Güvenlik

- **PII:** Telefon + tıbbi veri birleşimi hassas;
  WhatsApp Business API encryption at-rest + in-transit.
- **Opt-in/opt-out:** Kullanıcı "dur" yazarsa
  `audit:notification.opt_out` üretilir; tüm kanallardan
  çıkarılır.
- **Rate limit:** 1000 mesaj/saniye (Meta default);
  tenant bazında 100/saniye soft cap.

## Yapılmayanlar / Bilinçli Atlamalar

- **WhatsApp Business API partner entegrasyonu** (örn.
  Twilio Conversations) → Faz 14+.
- **Inbox yönetimi (canlı sohbet)** → Faz 14+.
- **Click-to-WhatsApp reklamları** → Faz 14+.

## Commit

- Core: (bu commit) — `apps/api/src/common/integrations/whatsapp/whatsapp.adapter.ts`
- Real: Faz 14+ (Meta Cloud API implementasyonu).
