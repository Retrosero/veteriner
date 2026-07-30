# POST /api/v1/clinic/waitlist/{id}/notify

Bekleme listesi kaydını "bildirildi" olarak işaretler. Slot açıldığında
resepsiyon tarafından çağrılır; hasta sahibine `in_app` bildirim gider
(stub). `status=notified`, `notifiedAt=now`.

- **Modül:** waitlist
- **Yetki:** `clinic:appointment:update` (STAFF / VETERINARIAN)
- **Audit:** `audit:waitlist.notify` (severity: info) —
  patientId, ownerId, notifiedAt, previousStatus.

**Path params:**

- `id` (string, zorunlu) — `wl-<uuid>`.

**Request body:** Yok.

**Response 200:**

```json
{ "notified": true }
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Waitlist kaydı bulunamadı / cross-tenant.
- `VET-CLINIC-0006` (422) — `scheduled` veya `cancelled` kayıt
  bildirilemez.

**Durum makinesi:**

```
waiting  → notified ✅
notified → notified (idempotent, no-op)
scheduled | cancelled | expired → notified ❌ (422 VET-CLINIC-0006)
```

**Notification stub:** `NotificationsService.send` best-effort
çağrılır (`in_app/custom/templateKey=waitlist.notify`). Hata
durumunda ana akış devam eder; audit.info yeterli iz bırakır. Gerçek
SMS/email FAZ-10+'da.

**Tenant izolasyonu:** `repo.findById(tenantId, id)` tenant filtresi
ile çalışır; cross-tenant → 404.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/waitlist.ts`
- AI chunk: `flow-waitlist`
