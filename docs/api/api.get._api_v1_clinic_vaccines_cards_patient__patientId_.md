# GET /api/v1/clinic/vaccines/cards/patient/{patientId}

Bir hastanın aşı kartını getirir. Kart; hastanın türüne uygun
protokoller için `VaccineCardEntry` listesi (aşı geçmişi, sonraki
tarih, durum, uygulayan veteriner, lot) ve özet (overdue /
upcoming / completed / not_started sayıları) içerir.

- **Modül:** vaccines (vaccine-cards)
- **Yetki:** `clinic:vaccination:read`
- **Audit:** yok (salt okunur)
- **Personel paneli** ve **portal** için ortak hesaplama; kök
  farklı.

**Path parametreleri:**

- `patientId` (string, 1-100) zorunlu.

**Hesaplama kuralları (service):**

- Cross-tenant `patientId` → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Uygulanabilir protokoller: türü `Patient.species` ile eşleşen
  veya `species='all'` olan protokol. `Patient.species='other'`
  ise tüm protokoller uygulanabilir (klinik politikası: tür
  bilinmiyor → tüm takvimler).
- Her uygulanabilir protokol için tüm `Vaccination` kayıtları
  (iptal edilenler dahil) toplanır; `VaccineCardEntry.status`
  çözümlenir:
  - `overdue`: son uygulamanın `nextDueAt`'i geçmiş VEYA tüm
    step'ler uygulanmış ama sonraki booster geçmiş.
  - `upcoming`: 30 gün içinde `nextDueAt`.
  - `completed`: tüm step'ler uygulanmış ve ek doz gerekmiyor.
  - `not_started`: hiç uygulama yok.
- `summary`: her durum için kayıt sayısı.
- `portalVisible`: tenant ayarı `portalVaccineCardEnabled`
  (default `true`).

**Response 200 (`VaccineCard`):**

```json
GET /api/v1/clinic/vaccines/cards/patient/pat-uuid
{
  "patientId": "pat-uuid",
  "tenantId": "tnt-uuid",
  "patientSpecies": "dog",
  "asOf": "2026-07-30T12:00:00.000Z",
  "summary": {
    "overdue": 1,
    "upcoming": 2,
    "completed": 0,
    "notStarted": 1
  },
  "portalVisible": true,
  "entries": [
    {
      "protocolId": "vacp-tnt12345-000001",
      "protocolName": "Karma aşı",
      "targetSpecies": ["dog", "cat"],
      "status": "upcoming",
      "appliedCount": 1,
      "expectedDoses": 2,
      "lastApplication": {
        "id": "vacr-tnt12345-000001",
        "administeredAt": "2026-07-15T09:00:00.000Z",
        "veterinarianId": "usr-uuid",
        "veterinarianName": "Dr. Ayşe Yılmaz",
        "vaccineName": "DHPP - 1. doz",
        "lotNumber": "LOT-2026-0001"
      },
      "nextDueAt": "2026-08-14T09:00:00.000Z",
      "overdueSince": null,
      "steps": [
        {
          "stepNumber": 1,
          "ageWeeks": 8,
          "applied": true,
          "applicationId": "vacr-tnt12345-000001",
          "appliedAt": "2026-07-15T09:00:00.000Z"
        },
        {
          "stepNumber": 2,
          "ageWeeks": 12,
          "applied": false,
          "applicationId": null,
          "appliedAt": null
        }
      ]
    }
  ]
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Patient
`PatientsService.findById` ile sorgulanır; cross-tenant → null
(bilgi sızdırmaz). SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-card.ts`
- Portal kökü: `GET /api/v1/portal/vaccines/cards/patient/{patientId}`
- Portal ayarı: `GET /api/v1/clinic/vaccines/cards/portal-setting`
- Uygulama: `POST /api/v1/clinic/vaccinations`
- AI chunk: `flow-vaccine-card`
- Audit event: yok (salt okunur)
