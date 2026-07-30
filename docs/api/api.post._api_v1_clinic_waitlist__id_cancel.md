# POST /api/v1/clinic/waitlist/{id}/cancel

Bekleme listesi kaydını iptal eder. `status=cancelled`. İkinci kez
çağrı idempotent (no-op). `scheduled` veya `expired` kayıt iptal
edilemez.

- **Modül:** waitlist
- **Yetki:** `clinic:appointment:cancel` (STAFF / VETERINARIAN)
- **Audit:** `audit:waitlist.cancel` (severity: **warning**) —
  patientId, ownerId, **reason**, previousStatus.

**Path params:**

- `id` (string, zorunlu) — `wl-<uuid>`.

**Request body:**

```json
{
  "reason": "Hasta sahibi aradı, iptal istedi"
}
```

- `reason` (string, zorunlu) — 1-500 karakter. Neden zorunludur;
  audit log'a yazılır.

**Response 200:**

```json
{ "cancelled": true }
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Waitlist kaydı bulunamadı / cross-tenant.
- `VET-CLINIC-0006` (422) — `scheduled` veya `expired` kayıt iptal
  edilemez.

**Durum makinesi:**

```
waiting | notified → cancelled ✅
cancelled → cancelled (idempotent, no-op)
scheduled | expired → cancelled ❌ (422 VET-CLINIC-0006)
```

**Tenant izolasyonu:** `repo.findById(tenantId, id)` tenant filtresi
ile çalışır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/waitlist.ts`
- AI chunk: `flow-waitlist`
