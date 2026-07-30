# POST /api/v1/clinic/examinations/{id}/sign

Tamamlanmış muayeneyi (`status=completed`) veteriner hekim adına
imzalar. `signedAt` + `signedBy` set edilir; imza sonrası klinik
kayıt **append-only** hale gelir (UPDATE/DELETE trigger FAZ-0'da
no-op flag, sadece log).

- **Modül:** examinations
- **Yetki:** `clinic:examination:sign` (VETERINARIAN)
- **Audit:** `audit:examination.sign` (severity: info) —
  signedAt, signedBy, previousStatus.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body:** Yok.

**Response 200 (`Examination`):**

```json
{
  "id": "exam-7a1b2c3d-9b1deb4d",
  "status": "completed",
  "signedAt": "2026-07-30T10:30:00.000Z",
  "signedBy": "usr-vet-uuid",
  "updatedAt": "2026-07-30T10:30:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.
- `VET-EXAM-0002` (409) — Yalnızca `completed` durumdaki muayene
  imzalanabilir; veya muayene zaten imzalanmış (`signedAt != null`).
  details'te mevcut `status` / `signedAt` döner.

**Durum makinesi:**

```
completed (signedAt=null) → completed (signedAt set) ✅
in_progress → completed (sign) ❌ (409 VET-EXAM-0002)
amended → completed (sign) ❌ (409 VET-EXAM-0002)
completed (signedAt!=null) → completed ❌ (409 VET-EXAM-0002)
```

**İş kuralları:**

- İmza sonrası doğrudan `UPDATE/DELETE` yasak; düzeltme yalnızca
  `POST .../amend` ile yeni `ExaminationAmend` kaydı üzerinden
  (append-only).
- İmzacı `actor.actorId`'dir; cross-actor imza atılamaz.
- Production migration'da DB trigger (`signed` → immutable) bu
  noktada aktifleşir; aynı davranış korunur.

**Tenant izolasyonu:** `repo.findById/update(tenantId, id)` yalnızca
actor.tenantId kapsamında çalışır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- Tamamla: `POST /api/v1/clinic/examinations/{id}/complete`
- Düzelt: `POST /api/v1/clinic/examinations/{id}/amend`
- AI chunk: `flow-examination-sign`
