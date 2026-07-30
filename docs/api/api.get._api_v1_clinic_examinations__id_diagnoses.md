# GET /api/v1/clinic/examinations/{id}/diagnoses

Muayeneye bağlı tüm teşhis kayıtlarını oluşturma zamanına göre
sıralı getirir. Tenant-scoped; farklı tenant'ın muayenesi için boş
dizi döner (bilgi sızdırmaz; okuma endpoint'i, 404 ayrıca üretmez).
Arşivlenmiş kayıtlar (`archivedAt` set edilmiş) listelenmez.

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma işlemi audit üretmez (listeleme standardı).

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (`Diagnosis[]`):**

```json
[
  {
    "id": "diagnosis-7a1b2c3d-000002",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "patientId": "33333333-3333-3333-333333333333",
    "code": "N18.9",
    "name": "Kronik böbrek yetmezliği",
    "category": "primary",
    "status": "chronic",
    "notes": "IRIS stage 2.",
    "createdAt": "2026-07-30T11:00:00.000Z",
    "createdBy": "usr-vet-uuid",
    "resolvedAt": null
  },
  {
    "id": "diagnosis-7a1b2c3d-000001",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "patientId": "33333333-3333-3333-333333333333",
    "code": null,
    "name": "Gastroenterit",
    "category": "secondary",
    "status": "resolved",
    "notes": null,
    "createdAt": "2026-07-30T10:00:00.000Z",
    "createdBy": "usr-vet-uuid",
    "resolvedAt": "2026-07-30T14:00:00.000Z"
  }
]
```

Sıralama: `createdAt` asc (ilk teşhis önce). Bir muayene sırasında
birden fazla teşhis olabilir (örn. primer + sekonder + ayırıcı
tanılar).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**İş kuralları:**

- `findByExaminationId(tenantId, examinationId)` tenant-scoped
  çalışır; cross-tenant → boş dizi (controller 404 ayrıca üretmez;
  bilgi sızdırmaz; "o muayenenin teşhis listesi" semantiği tercih
  edildi).
- Repository `archivedAt IS NULL` filtresi uygular; arşivlenen
  teşhisler listelenmez (soft delete).
- `listForExamination` ayrıca muayene varlık kontrolü yapmaz
  (tenant-scoped sorgu zaten boş döner; okuma endpoint'i, semantik
  olarak "o muayenenin teşhis listesi" demek).

**Tenant izolasyonu:** Repository `findByExaminationId(tenantId,
examinationId)` yalnızca `actor.tenantId` kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- Hastanın tüm teşhisleri: `GET /api/v1/clinic/patients/{id}/diagnoses`
- AI chunk: `flow-diagnosis`
