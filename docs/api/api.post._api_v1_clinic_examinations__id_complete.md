# POST /api/v1/clinic/examinations/{id}/complete

Devam eden muayeneyi (`status=in_progress`) tamamlanmış (`completed`)
yapar ve `completedAt` zaman damgasını set eder.

- **Modül:** examinations
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:examination.update` (severity: info) —
  before/after status, completedAt.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body:** Yok.

**Response 200 (`Examination`):**

```json
{
  "id": "exam-7a1b2c3d-9b1deb4d",
  "status": "completed",
  "completedAt": "2026-07-30T10:25:00.000Z",
  "updatedAt": "2026-07-30T10:25:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.
- `VET-EXAM-0001` (409) — Yalnızca `in_progress` durumdaki muayene
  tamamlanabilir; details'te mevcut `status` döner.

**Durum makinesi:**

```
in_progress → completed ✅
completed | amended → completed ❌ (409 VET-EXAM-0001)
```

**İş kuralları:**

- Tamamlama sonrası muayene `signedAt=null` kalır; imza ayrı
  adımdır (`POST .../sign`).
- SOAP / vital / teşhis kayıtları bu aşamada bağlanmamıştır;
  GOAL-041+ scope'undadır.

**Tenant izolasyonu:** `repo.findById/update(tenantId, id)` yalnızca
actor.tenantId kapsamında çalışır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- İmzala: `POST /api/v1/clinic/examinations/{id}/sign`
- AI chunk: `flow-examination-create`
