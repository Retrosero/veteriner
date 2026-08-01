# GET /api/v1/clinic/patients/{id}/diagnoses

Hastanın tüm muayenelerinden teşhis kayıtlarını toplar. Opsiyonel
`status` ve `includeArchived` filtreleri. Tenant-scoped; hasta
`PatientsService.findById` ile aynı tenant'ta mı doğrulanır
(cross-tenant → 404 `VET-CLINIC-0001`).

- **Modül:** diagnoses
- **Yetki:** `clinic:patient:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma işlemi audit üretmez (listeleme standardı).

**Path params:**

- `id` (string, zorunlu) — hasta ID'si.

**Query params:**

- `status` (enum, opsiyonel) — `active` | `resolved` | `chronic`
  | `ruled_out`. Yalnızca belirtilen durumdaki teşhisleri getirir.
- `includeArchived` (boolean, opsiyonel, default `false`) —
  `true` ise `archivedAt` set edilmiş (arşivlenmiş) kayıtlar da
  listelenir.

**Response 200 (`Diagnosis[]`):**

```json
[
  {
    "id": "diagnosis-7a1b2c3d-000001",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "patientId": "33333333-3333-3333-333333333333",
    "code": "N18.9",
    "name": "Kronik böbrek yetmezliği",
    "category": "primary",
    "status": "chronic",
    "notes": "IRIS stage 2.",
    "createdAt": "2026-07-15T10:00:00.000Z",
    "createdBy": "usr-vet-uuid",
    "resolvedAt": null
  },
  {
    "id": "diagnosis-7a1b2c3d-000010",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9c2deb4d",
    "patientId": "33333333-3333-3333-333333333333",
    "code": "K05.30",
    "name": "Periodontitis",
    "category": "primary",
    "status": "active",
    "notes": null,
    "createdAt": "2026-07-30T09:00:00.000Z",
    "createdBy": "usr-vet-uuid",
    "resolvedAt": null
  }
]
```

Sıralama: `createdAt` desc (en yeni önce). Problem listesi
görünümü için kronik + aktif teşhisler genelde ilk sırada yer alır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Query parse hatası (geçersiz
  `status` enum, `includeArchived` boolean coercion).
- `VET-CLINIC-0001` (404) — Hasta bulunamadı / cross-tenant.

**İş kuralları:**

- Hasta `PatientsService.findById(tenantId, id, actor)` ile aynı
  tenant'ta mı doğrulanır; cross-tenant → 404 `VET-CLINIC-0001`
  (bilgi sızdırmaz).
- `status` filtresi verilirse yalnızca o durumdaki kayıtlar döner;
  verilmezse tüm aktif (arşivlenmemiş) kayıtlar döner
  (`includeArchived=false` default).
- `includeArchived=true` ile birlikte kullanıldığında
  `archivedAt IS NOT NULL` kayıtlar da listelenir (geri alma
  senaryoları için).
- Zod şema `.coerce.boolean()` ile `?includeArchived=1` veya
  `?includeArchived=true` gibi string query'leri otomatik boolean'a
  çevirir.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`

- hasta varlık kontrolü `actor.tenantId` kapsamında; cross-tenant
  denemesi → 403 `VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- AI chunk: `flow-diagnosis`
