# POST /api/v1/clinic/portal-appointments/requests/{id}/reject

Personel (`STAFF` / `VETERINARIAN`) bekleyen bir **online randevu
talebini** reddeder. `reason` zorunludur (1-500 karakter); talep
`rejected` statüsüne geçer ve `rejectionReason` set edilir.

- **Modül:** portal-appointments (clinic controller)
- **Yetki:** `clinic:appointment:create` (STAFF / VETERINARIAN).
  Approve ile aynı kategori.
- **Audit:** `audit:portal.appointment.reject` (severity: **warning**) —
  patientId, ownerId, decidedBy, reason, previousStatus.
- **Idempotency:** Hayır — ikinci `reject` → 422.
- **Yan etki:** Sahibine in-app red bildirimi gönderilir
  (template `portal.appointment.rejected`, best-effort).

## Request

**Path params:**

- `id` (string, zorunlu) — `pareq-<tenant8>-<stamp>-<rnd>`.

**Body (`AppointmentRequestRejectInput`):**

```json
{
  "reason": "Uygun slot yok, lütfen farklı tarih deneyin"
}
```

- `reason` (string, 1-500, zorunlu) — Neden zorunludur; audit
  payload'ına yazılır ve sahibine gönderilen bildirimde görünür.

## Response

**200 OK:**

```json
{
  "rejected": true
}
```

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — `clinic:appointment:create` yetkisi yok
  veya tenant uyumsuz.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (örn. `reason`
  boş/eksik veya 500 karakter üstü).
- `VET-CLINIC-0001` (404) — Talep bulunamadı / cross-tenant.
- `VET-PORTAL-0006` (422) — Talep `pending` değil (`approved |
  rejected | cancelled`).

## Güvenlik notları

- `decidedBy` kaynağı `actor.actorId`; null ise fallback `"system"`.
- `rejectionReason` audit'te PII sayılmaz (klinik gerekçesi);
  bildirim template'inde olduğu gibi kullanıcıya gösterilir.
- `requireTenantScope` cross-tenant denemeyi 403 ile reddeder;
  SUPERADMIN bypass'lı.
- Red bildirimi `notifications.send` hatası akışı **durdurmaz**
  (best-effort).

**Durum makinesi:**

```
pending    → rejected ✅ (reason set, audit.warning)
approved   → rejected ❌ (422 VET-PORTAL-0006)
rejected   → rejected ❌ (422 VET-PORTAL-0006)
cancelled  → rejected ❌ (422 VET-PORTAL-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-appointment-request.ts`
- Onay: `POST /api/v1/clinic/portal-appointments/requests/{id}/approve`
- AI chunk: `flow-portal-appointment-request`
