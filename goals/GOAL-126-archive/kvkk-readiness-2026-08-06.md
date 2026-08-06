# GOAL-126 — KVKK + Veri Yaşam Döngüsü Hazırlık Raporu

**Tarih:** 2026-08-06
**Durum:** 16/16 unit test geçti, core service hazır, controller+endpoint
planlanmış (FAZ-12+ devam).

## Özet

VetNiva KVKK (Türkiye) + UK GDPR (İngiltere) uyumlu veri yaşam
döngüsü core service hazır:

- **16/16 unit test** geçti (`kvkk.service.spec.ts`).
- **Core service** (`apps/api/src/common/kvkk/kvkk.service.ts`):
  - `createErasureRequest()` — KVKK Madde 11 silme talebi
  - `applyErasure()` — PII anonimleştirme (6 alan)
  - `exportTenantData()` — JSON export + retention notice
- **Audit trail** — tüm aksiyonlarda `audit:kvkk.*` event'i
  üretilir (PII hash'li, ham ID loglanmaz).
- **PII güvenliği** — tenant ID raw log'a yazılmaz; 8-karakter
  hash kullanılır (test ile doğrulandı).
- **Legal retention** — `LEGAL_RETENTION_YEARS`: medical 7 / financial
  5 / audit 3 yıl (KVKK Madde 7 + UK GDPR Article 6(1)(c)).

## Unit Test Sonuçları

| Test | Sayı | Durum |
| --- | --- | --- |
| createErasureRequest — temel | 4 | ✅ |
| applyErasure — PII alanları | 3 | ✅ |
| exportTenantData — JSON format | 5 | ✅ |
| LEGAL_RETENTION_YEARS sabitleri | 4 | ✅ |
| **Toplam** | **16** | **✅ 16/16** |

Çalıştırma: `pnpm --filter @vetniva/api test -- src/common/kvkk`

## KVKK Madde 11 + UK GDPR Article 15 Uyum

| Talep | VetNiva Karşılığı | Durum |
| --- | --- | --- |
| KVKK M.11/a — Veriye erişim | `exportTenantData()` JSON | ✅ Core |
| KVKK M.11/b — Düzeltme | Amendment pattern (append-only) | ✅ Mevcut |
| KVKK M.11/c — Silme | `createErasureRequest` + `applyErasure` | ✅ Core |
| KVKK M.11/d — İşlemenin kısıtlanması | Legal hold (SUPERADMIN) | 🟡 Manuel |
| UK GDPR Art.15 — Subject access | `exportTenantData` | ✅ Core |
| UK GDPR Art.17 — Right to erasure | Erasure request flow | ✅ Core |
| UK GDPR Art.25 — Privacy by design | PII `pii: true` flag | ✅ Mevcut |

## Anonimleştirme Standardı

6 PII alanı `kvkk-erased-<sha256(userId+field).slice(0,8)>` formatında
değiştirilir:

| Alan | Hash örneği |
| --- | --- |
| firstName | `kvkk-erased-a3b8c2d1` |
| lastName | `kvkk-erased-7f9e1a4b` |
| email | `kvkk-erased-2c5d8e6f` |
| phone | `kvkk-erased-b4c7e0a9` |
| taxId | `kvkk-erased-5d8a1f3c` |
| address | `kvkk-erased-9e2b4c7d` |

Hash userId'ye bağlı; aynı kullanıcının farklı alanları farklı hash alır.

## Audit Log Güvenliği

`exportTenantData` audit mesajı ham `tenantId` içermez; yalnızca 8-karakter
hex hash yazılır. Bu davranış 16 testten 1'i tarafından zorunlu kılındı
ve service implementasyonu bu testin geri bildirimi ile düzeltildi
(eskiden `tenant=${tenantId}` yazıyordu — PII sızıntısı riski).

## Yapılmayanlar / Pilot Kapsamı Dışı

Aşağıdaki öğeler `GOAL-126_COMPLETION_REPORT.md` "Yapılmayanlar"
bölümünde listelenmiş; production-ready döneminde eklenmeli:

- **API endpoint'ler** (`/api/v1/kvkk/erasure-requests`, `/export`)
  — controller katmanı, FAZ-12+ devam.
- **3rd party DPO atama** — Faz 12+.
- **ICO kaydı (UK)** — Faz 14+ (en-GB lokalizasyonu).
- **VERBİS kaydı (KVKK Kurulu)** — Faz 12+ (yıllık yenileme).
- **OpenAPI extension (x-kvkk-redacted)** — Faz 12+ (sözleşme).
- **Real Prisma migration** — FAZ-10+ DB katmanı entegrasyonu.

## Takip Öğeleri (production-ready öncesi)

1. **Controller + endpoint** — `kvkk.controller.ts` ile
   `POST /api/v1/kvkk/erasure-requests`, `GET /export`.
2. **Erasure request lifecycle** — pending → in_progress →
   completed/rejected state machine + UI.
3. **Audit event'leri gerçek DB'ye yaz** — şu an yalnızca
   `Logger.warn` ile konsola; FAZ-12+ audit_log tablosuna.
4. **DPO contact UI** — `/settings/privacy` sayfasında iletişim
   bilgisi + talep oluşturma akışı.
5. **Yıllık VERBİS yenileme hatırlatıcısı** — admin dashboard'da
   `KvkkVerbisRenewal` task (cron).

## Tenant Export (PII mask'lenmeden)

KVKK Madde 11 + UK GDPR Madde 15 kapsamında tenant verisinin
tamamı JSON formatında dışa aktarılır. Bu **veri sahibinin kendi
verisidir**; bu nedenle PII mask'lenmez (aksi halde veri sahibine
faydası olmaz).

Export yapısı (7 veri kategorisi):

```json
{
  "exportedAt": "2026-08-06T12:00:00.000Z",
  "tenantId": "11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1",
  "tenantSlug": "tnt-11c6beec",
  "format": "json",
  "data": {
    "owners": [...],
    "patients": [...],
    "examinations": [...],
    "vaccinations": [...],
    "prescriptions": [...],
    "sales": [...],
    "payments": [...]
  },
  "retentionNotice": {
    "message": "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl saklanır.",
    "legalBasis": "KVKK_MADDE_7",
    "retentionYears": 7
  }
}
```

Production'da `data` array'leri Prisma repository üzerinden doldurulur
(su an `[]` default).
