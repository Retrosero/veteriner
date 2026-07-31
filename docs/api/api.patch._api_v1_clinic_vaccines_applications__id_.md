# PATCH /api/v1/clinic/vaccines/applications/{id}

Bir aşı uygulama kaydını düzeltir (amendment). Yalnızca
`status='active'` olan kayıtlar düzeltilebilir. Düzeltme sonrası
status `amended` olur ve eski kayıt korunur (fiziksel silme
YOK). Klinik tıbbi kayıtların geçmişi yok edilemez kuralının
uygulaması.

- **Modül:** vaccines (vaccine-applications)
- **Yetki:** `clinic:vaccination:amend` (yüksek yetki)
- **Audit:** `audit:vaccine.application.amend` (warning);
  `lotChange` varsa before/after ayrıca loglanır.

**Path parametreleri:**

- `id` (string, 1-100) zorunlu.

**Request body (`VaccineApplicationAmendInput`):**

```json
PATCH /api/v1/clinic/vaccines/applications/vacr-tnt12345-000001
{
  "dose": "1.2 ml",
  "nextDueDate": "2026-09-10T09:00:00.000Z",
  "notes": "Revize doz (yavru gelişimi)",
  "lot": {
    "lotNumber": "LOT-2026-0099",
    "expiryDate": "2027-12-31T00:00:00.000Z",
    "manufacturer": "Nobivac"
  },
  "amendReason": "İlk kayıtta doz yanlış yazılmış"
}
```

- `dose` (string, 1-100) opsiyonel — değişmeyecekse gönderme.
- `nextDueDate` (ISO 8601 datetime) opsiyonel.
- `notes` (string, ≤2000) opsiyonel.
- `lot` (object) opsiyonel — değişmeyecekse gönderme.
  - `lotNumber` (string, 1-100).
  - `expiryDate` (ISO 8601 datetime) — geçmiş tarih olamaz
    (422 `VET-VACC-0010`).
  - `manufacturer` (string, ≤200) opsiyonel.
- `amendReason` (string, 1-500) **zorunlu** — düzeltme nedeni
  (denetim/sorumluluk için).

**İş kuralları (service):**

- `existing.status !== 'active'` → 409 `VET-VACC-0007`
  (iptal edilmiş/düzeltilmiş kayıt amend edilemez).
- `lot` değişirse atomik ters kayıt + yeni düşüm:
  1. Yeni lot SKT kontrolü → geçmişse 422 `VET-VACC-0010`.
  2. Yeni lot yeterli stok kontrolü → yetersizse 422
     `VET-VACC-0009`.
  3. Eski lot'a `VaccineStockLedger` ters kaydı (reversal).
  4. Yeni lot'a düşüm kaydı.
  5. Application kaydı `lot` alanı güncellenir.
- Tüm bu adımlar tek bir service çağrısı içinde senkronize;
  herhangi birinde hata → mevcut lot ve stok dokunulmaz.
- `before` snapshot (dose, nextDueDate, notes, lot) audit
  payload'ına eklenir; sonraki denetim/ifade için gerekli.

**Response 200 (`VaccineApplication`):**

```json
{
  "id": "vacr-tnt12345-000001",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "veterinarianId": "usr-uuid",
  "protocolId": "vacp-tnt12345-000001",
  "vaccineName": "DHPP - 1. doz",
  "dose": "1.2 ml",
  "lot": {
    "lotNumber": "LOT-2026-0099",
    "expiryDate": "2027-12-31T00:00:00.000Z",
    "manufacturer": "Nobivac"
  },
  "applicationDate": "2026-07-15T09:00:00.000Z",
  "nextDueDate": "2026-09-10T09:00:00.000Z",
  "status": "amended",
  "notes": "Revize doz (yavru gelişimi)",
  "amendedAt": "2026-07-30T12:00:00.000Z",
  "amendedBy": "usr-uuid",
  "amendmentChainId": "ach-uuid"
}
```

- `status` → `amended` (fiziksel silme yok).
- `amendedAt`, `amendedBy` set edilir.
- `amendmentChainId` — birden fazla amend için zincirleme
  parent bağlantısı (ileride; şu an tek amend kabul).
- `vaccineStockLedger` reversals yeni movement ID'leri audit
  payload'ında.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).
- `VET-CLINIC-0001` (404) — Uygulama kaydı bulunamadı
  (cross-tenant dahil).
- `VET-VACC-0007` (409) — Aktif olmayan kayıt düzeltilemez.
- `VET-VACC-0009` (422) — Yeni lot yetersiz stok.
- `VET-VACC-0010` (422) — Yeni lot SKT geçmiş.
- `VET-VACC-0001` (422) — Doz/uygulama tutarsızlığı.

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Cross-tenant
applicationId → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
SUPERADMIN bypass'lı.

**Append-only garantisi:**

- Eski kayıt repo'da korunur (status='amended'); veri
  fiziksel silinmez.
- Audit olayında `before` snapshot + `lotChange` before/after
  payload'a eklenir; KVKK denetiminde kanıt olarak kullanılır.
- Stok hareketleri de append-only: ters kayıt (`type='reversal'`)
  + yeni düşüm atomik; mevcut bakiye bozulmaz.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-application.ts`
- Oluştur: `POST /api/v1/clinic/vaccines/applications`
- Liste: `GET /api/v1/clinic/vaccines/applications`
- Hastaya göre: `GET /api/v1/clinic/vaccines/applications/patient/{patientId}`
- Detay: `GET /api/v1/clinic/vaccines/applications/{id}`
- İptal: `DELETE /api/v1/clinic/vaccines/applications/{id}`
- AI chunk: `flow-vaccine-application-amend`
- Audit event: `audit:vaccine.application.amend`
