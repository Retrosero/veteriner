# GET /api/v1/clinic/examinations/{id}/shares

Bir muayeneye ait tüm paylaşım kayıtlarını `createdAt` desc sırayla
döner (aktif + iptal edilmiş). Tenant-scoped; cross-tenant → 404
`VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** clinical-records
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma — audit üretmez.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (`ClinicalRecordShareList`):**

```json
{
  "items": [
    {
      "id": "crshare-7a1b2c3d-000001",
      "tenantId": "tnt-uuid",
      "examinationId": "exam-7a1b2c3d-9b1deb4d",
      "fileId": "11111111-1111-1111-111111111111",
      "channels": ["email", "portal"],
      "sentChannels": ["email", "portal"],
      "createdAt": "2026-07-30T12:00:00.000Z",
      "createdBy": "usr-staff-uuid",
      "expiresAt": "2026-08-06T12:00:00.000Z",
      "revokedAt": null,
      "signedUrl": null
    },
    {
      "id": "crshare-7a1b2c3d-000000",
      "tenantId": "tnt-uuid",
      "examinationId": "exam-7a1b2c3d-9b1deb4d",
      "fileId": "22222222-2222-2222-222222222222",
      "channels": ["email"],
      "sentChannels": ["email"],
      "createdAt": "2026-07-25T09:00:00.000Z",
      "createdBy": "usr-vet-uuid",
      "expiresAt": "2026-08-01T09:00:00.000Z",
      "revokedAt": "2026-07-26T10:00:00.000Z",
      "signedUrl": null
    }
  ]
}
```

- `items[].revokedAt` null ise paylaşım aktif; dolu ise
  `DELETE /api/v1/clinic/shares/{shareId}` ile iptal edilmiş.
- `items[].signedUrl` FAZ-0'da `null` (gerçek signed URL FAZ-10+'da).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Examination bulunamadı / cross-tenant.

**İş kuralları:**

- `listShares(tenantId, examinationId, actor)` tenant-scoped; önce
  examination aynı tenant'ta mı doğrulanır, sonra repo
  `findByExamination(tenantId, examinationId)` ile share kayıtları
  çekilir.
- Cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Response `ClinicalRecordShare` şeması: `id`, `tenantId`,
  `examinationId`, `fileId`, `channels`, `sentChannels`, `createdAt`,
  `createdBy`, `expiresAt`, `revokedAt`, `signedUrl` tamamı
  response'ta yer alır; null olan alanlar açıkça null döner.
- `revokedAt` filtresi yoktur — UI hem aktif hem iptal edilmiş
  paylaşımları gösterir (geçmiş takibi için).
- Listeleme audit üretmez; paylaşım oluşturma ve iptal audit
  eventleri ayrı yazılır.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-record-share.ts`
- PDF render: `GET /api/v1/clinic/examinations/{id}/pdf`
- Paylaşım: `POST /api/v1/clinic/examinations/{id}/share`
- Paylaşım iptal: `DELETE /api/v1/clinic/shares/{shareId}`
- AI chunk: `clinical-record-share`
