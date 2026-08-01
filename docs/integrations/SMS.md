# SMS Sağlayıcı Entegrasyonu (GOAL-131)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Amaç

Mevcut in-memory notification queue yerine gerçek SMS
sağlayıcısı entegrasyonu. Türkiye'de en yaygın
sağlayıcılar: NetGSM, İleti Merkezi. Uluslararası
fallback: Twilio, MessageBird.

## Adapter Sözleşmesi

`apps/api/src/common/integrations/sms/sms.adapter.ts`'te
tanımlı. `SmsAdapter` interface'i:

```typescript
interface SmsAdapter {
  readonly name: SmsProvider; // "netgsm" | "twilio" | ...
  send(input: SmsSendInput): Promise<SmsSendResult>;
  queryStatus(messageId: string): Promise<SmsSendResult["status"]>;
}
```

## Sağlayıcı Seçimi

| Sağlayıcı         | TR     | Maliyet  | Güvenilirlik | Entegrasyon |
| ----------------- | ------ | -------- | ------------ | ----------- |
| **NetGSM**        | ✓      | düşük    | yüksek       | 1 hafta     |
| **İleti Merkezi** | ✓      | düşük    | yüksek       | 1 hafta     |
| Twilio            | global | orta     | çok yüksek   | 3 gün       |
| MessageBird       | global | orta     | yüksek       | 3 gün       |
| NoOp (dev/test)   | -      | ücretsiz | -            | -           |

Pilot için: **NetGSM** (TR odaklı, ucuz, iyi deliverability).

## Provider Konfigürasyonu

```env
SMS_PROVIDER=netgsm
SMS_NETGSM_USERNAME=xxx
SMS_NETGSM_PASSWORD=xxx
SMS_NETGSM_SENDER_ID=VETNIVA
```

## İş Akışı

1. **NotificationService** → SMS gönderim talebi
   (`appointment_reminder`, `vaccine_reminder`, vb.).
2. **SmsAdapter.send():** Provider API'sine POST.
3. **Webhook:** Provider durumu değişince webhook alınır;
   `audit:notification.delivered` veya
   `audit:notification.failed` üretilir.
4. **Retry:** 3 deneme (exponential backoff 1m, 5m, 30m).
5. **Dead letter:** 3 başarısız deneme sonrası job_runs
   dead_letter'a düşer.

## Türkiye Regülasyonu

- **BTK izni:** Toplu SMS gönderimi için Bilgi Teknolojileri
  ve İletişim Kurumu izni + ETBYS (Elektronik Tebligat
  Bildirim Yönetim Sistemi) kaydı zorunlu.
- **İçerik kısıtı:** Reklam/pazarlama SMS'leri için önceden
  onay (çift opt-in) gerekir.
- **Gönderim saatleri:** 22:00-08:00 arası yasak
  (BTK yönetmeliği).

## Testler

- **NoOp adapter:** development + test.
- **Sandbox adapter (NetGSM test hesabı):** staging.
- **Production:** pilot onayından sonra.

## Yapılmayanlar / Bilinçli Atlamalar

- **OTP / 2FA SMS** → Faz 14+ (auth akışı).
- **WhatsApp + SMS failover** → Faz 13+ (FAZ-132 WhatsApp
  ile).
- **Çoklu sağlayıcı yük dengeleme** → Faz 14+ (provider
  rotation).

## Commit

- Core: (bu commit) — `apps/api/src/common/integrations/sms/sms.adapter.ts`
- Real: Faz 14+ (sağlayıcı implementasyonu).
