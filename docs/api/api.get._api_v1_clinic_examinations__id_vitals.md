# GET /api/v1/clinic/examinations/{id}/vitals

Muayeneye bağlı tüm vital kayıtlarını `takenAt` desc sırasıyla
döndürür. Tenant-scoped; farklı tenant'ın muayenesi için boş
dizi döner (bilgi sızdırmaz; okuma endpoint'i, 404 ayrıca
üretmez).

- **Modül:** vitals
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma işlemi audit üretmez (listeleme standardı).

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (`VitalsRecord[]`):**

```json
[
  {
    "id": "vitals-7a1b2c3d-000003",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "patientId": "33333333-3333-3333-3333-333333333333",
    "veterinarianId": "vet-uuid",
    "vitalSigns": {
      "temperatureC": 38.5,
      "heartRateBpm": 110,
      "respiratoryRateBpm": 24
    },
    "takenAt": "2026-07-30T12:00:00.000Z",
    "recordedBy": "usr-vet-uuid"
  },
  {
    "id": "vitals-7a1b2c3d-000002",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "patientId": "33333333-3333-3333-3333-333333333333",
    "veterinarianId": "vet-uuid",
    "vitalSigns": {
      "temperatureC": 39.0,
      "heartRateBpm": 115
    },
    "takenAt": "2026-07-30T10:00:00.000Z",
    "recordedBy": "usr-vet-uuid"
  }
]
```

Sıralama: `takenAt` desc (en yeni önce). Bir muayene sırasında
birden fazla vital kaydı olabilir (örn. anestezi takibi veya
tedavi süreci).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**İş kuralları:**

- `findByExamination(tenantId, examinationId, actor)` tenant-scoped
  çalışır; cross-tenant → boş dizi (controller 404 ayrıca üretmez;
  bilgi sızdırmaz; "o muayenenin vital listesi" semantiği tercih
  edildi).
- `takenAt` localeCompare ile desc sıralanır (ISO 8601 string
  karşılaştırma).
- Vital kaydı append-only; liste zaman serisi görünümü sunar
  (yanlış ölçüm düzeltmesi yeni kayıt olarak kalır, önceki kayıt
  korunur).

**Tenant izolasyonu:** Repository `findByExamination(tenantId,
examinationId)` yalnızca `actor.tenantId` kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vitals.ts`
- Vital kaydet: `POST /api/v1/clinic/examinations/{id}/vitals`
- Hastanın en yeni vitali: `GET /api/v1/clinic/patients/{id}/vitals/latest`
- AI chunk: `flow-vitals`
