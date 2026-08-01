# UK GDPR Şartları (GOAL-145)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Özet

UK GDPR + Data Protection Act 2018 uyumluluğu. VetNiva'nın
İngiltere pilotu için zorunlu gereksinimler.

## Yasal Dayanak

- **UK GDPR:** 31 Aralık 2020'den beri Brexit sonrası AB
  GDPR'ın İngiltere versiyonu.
- **Data Protection Act 2018 (DPA 2018):** UK GDPR'ın
  ulusal kanunla tamamlayıcısı.
- **PECR (Privacy and Electronic Communications
  Regulations):** Pazarlama iletişimi.

## UK GDPR — KVKK Farklılıkları

| Alan                  | KVKK (TR)         | UK GDPR (GB)                                       |
| --------------------- | ----------------- | -------------------------------------------------- |
| Yasal dayanak         | Açık rıza (genel) | Meşru menfaat (Legitimate Interest) sık kullanılır |
| Veri koruma sorumlusu | Veri sorumlusu    | Data Controller                                    |
| Veri işleyen          | Veri işleyen      | Data Processor                                     |
| Ana otorite           | KVKK Kurulu       | ICO (Information Commissioner's Office)            |
| Kayıt                 | VERBİS            | ICO register (£40/yıl veya ücretsiz)               |
| Çapraz transfer       | KVKK Kurul onayı  | Adequacy decision (AB + ABD)                       |

## Veri Sahibinin Hakları (UK GDPR)

- **Right to be informed** (bilgilendirme).
- **Right of access** (erişim).
- **Right to rectification** (düzeltme).
- **Right to erasure** (silme — "right to be forgotten").
- **Right to restrict processing** (kısıtlama).
- **Right to data portability** (taşınabilirlik — JSON
  export, FAZ-125).
- **Right to object** (itiraz).
- **Rights related to automated decision making and
  profiling** (otomatik karar).

## ICO Kaydı

- **ICO Data Protection Register:** GB'de ticari faaliyet
  için zorunlu.
- **Maliyet:** £40/yıl (küçük organizasyon) veya £2,900
  (büyük).
- **Self-registration:** ICO web sitesinden online.

## KVKK Erasure (GOAL-126) + UK GDPR Karşılığı

- `KvkkService.createErasureRequest` interface'i
  `GdprErasureRequest` ile aynı.
- **Fark:** UK GDPR'da "right to be forgotten" mutlak
  değil; yasal saklama (örn. 7 yıl tıbbi) nedeniyle
  reddedilebilir.
- **28 gün süre** (UK GDPR); KVKK 30 gün.
- **Privacy notice** UI'da görünür olmalı (cookie + veri
  toplama).

## Audit (FAZ-0 standardı)

- `audit:gdpr.data_access` (her okuma).
- `audit:gdpr.export` (her export).
- `audit:gdpr.erasure` (her silme).
- `audit:gdpr.consent_change` (her onay değişimi).

## Uyum Adımları

1. **Privacy notice** (UI + PDF) hazırla.
2. **Cookie banner** (UK PECR uyumlu).
3. **Data processing agreement (DPA)** tenant'lar için.
4. **ICO register** self-registration.
5. **Data protection officer (DPO):** atama (opsiyonel
   — 250+ çalışan varsa zorunlu).
6. **Privacy by design:** her yeni feature privacy review.
7. **DPIA (Data Protection Impact Assessment):** yüksek
   riskli işlemler için.

## Endpoint'ler

- `GET /api/v1/gdpr/export` (FAZ-125 ile aynı).
- `POST /api/v1/gdpr/erasure-requests`.
- `GET /api/v1/gdpr/privacy-notice` (statik).

## Yapılmayanlar / Bilinçli Atlamalar

- **ICO register self-registration** → Faz 14+
  (pilot başlangıcında).
- **DPO atama** → Faz 15+ (pilot ölçek için).
- **DPIA otomasyonu** → Faz 15+.
- **International transfer (adequacy)** → Faz 15+.

## Commit

- Docs: (bu commit) — `docs(security): GOAL-145 UK GDPR şartları dokümanı`
- Code: `gdpr.erasure` modülü (FAZ-126 `kvkk.service.ts`
  ile paylaşımlı).
