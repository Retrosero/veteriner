# POST /api/v1/portal-appointments/requests

Giriş yapmış hasta sahibi, kendi hayvan(lar)ı için **online randevu
talebi** oluşturur. Talep doğrudan onaylı randevu olmaz; klinik
personelinin onayına düşer. Talep `pending` statüsünde başlar;
personel `approve` ederse `AppointmentsService.create` ile gerçek
randevu oluşturulur.

- **Modül:** portal-appointments
- **Yetki:** `PortalSessionGuard` (`actorType: "portal_user"`,
  `role: "PET_OWNER_PORTAL"`, `source: "portal_session"`). Cookie
  `vetniva_portal_session` veya `Authorization: Bearer` header.
- **Audit:** `audit:portal.appointment.request` (severity: info) —
  patientId, ownerId, type, preferredDate, preferredVeterinarianId,
  contactPreference.
- **Idempotency:** N/A (her çağrı yeni talep). İleride
  `Idempotency-Key` header'ı ile de-duplikasyon eklenebilir.
- **Yan etki:** 2 in-app bildirim (sahibine + klinik personeline)
  best-effort gönderilir.

## Request

**Headers:**

- `Cookie: vetniva_portal_session=<token>` **veya**
  `Authorization: Bearer <sessionToken>` — zorunlu. Geçersiz
  veya süresi dolmuşsa 401.
- `x-tenant-id` / `x-tenant-slug` — **taşınmaz**; tenant session'dan.

**Body (`AppointmentRequestCreateInput`):**

```json
{
  "patientId": "33333333-3333-3333-3333-333333333333",
  "preferredDate": "2026-08-15T10:00:00.000Z",
  "preferredVeterinarianId": "vet-uuid",
  "type": "consultation",
  "reason": "Yıllık kontrol için uygun zaman",
  "contactPreference": "phone"
}
```

- `patientId` (UUID, zorunlu) — portaldaki kullanıcının `ownerId`'sine
  ait aktif hayvan. Cross-owner / cross-tenant → 404
  `VET-CLINIC-0001` (bilgi sızdırmaz).
- `preferredDate` (ISO 8601, zorunlu) — gelecekte olmalı.
  Geçmiş/parse hatası → 422 `VET-VALIDATION-0009`.
- `preferredVeterinarianId` (string, opsiyonel) — belirli bir
  veteriner isteği. Yoksa FAZ-0'da `PLACEHOLDER_VETERINARIAN_ID`
  kullanılır (round-robin/skill-match FAZ-3+'da).
- `type` (enum, zorunlu) — `consultation | vaccination | surgery |
follow_up | lab_visit | grooming`.
- `reason` (string, 1-2000, zorunlu) — serbest metin.
- `contactPreference` (enum, zorunlu) — `phone | email | sms`.

## Response

**201 Created (`AppointmentRequest`):**

```json
{
  "id": "pareq-tntaaaaa-xxxx-yyyy",
  "tenantId": "tnt-uuid",
  "patientId": "33333333-3333-3333-3333-333333333333",
  "ownerId": "own-uuid",
  "status": "pending",
  "preferredDate": "2026-08-15T10:00:00.000Z",
  "preferredVeterinarianId": "vet-uuid",
  "type": "consultation",
  "reason": "Yıllık kontrol için uygun zaman",
  "contactPreference": "phone",
  "requestedAt": "2026-07-30T12:00:00.000Z",
  "decidedAt": null,
  "decidedBy": null,
  "rejectionReason": null,
  "approvedAppointmentId": null
}
```

- `id` — `pareq-<tenant8>-<stamp>-<rnd>` formatında.
- `status` — oluşturulduğunda her zaman `pending`.
- `approvedAppointmentId` — null; yalnızca `approve` sonrası dolar.

## Hata kodları

- `VET-AUTH-0001` (401) — Portal session yok / süresi dolmuş
  (`PortalSessionGuard`).
- `VET-AUTHZ-0001` (403) — Cross-tenant session.
- `VET-VALIDATION-0001` (400) — Body Zod parse hatası (örn. `type`
  enum dışı, `reason` uzunluk).
- `VET-VALIDATION-0009` (422) — `preferredDate` geçmiş veya parse
  edilemez.
- `VET-CLINIC-0001` (404) — `patientId` cross-tenant, başka owner'a
  ait veya portal user bulunamadı (bilgi sızdırmaz).

## Güvenlik notları

- `ownerId` filtre kaynağı **yalnızca** `PortalUser.ownerId`; URL
  veya body'den alınmaz.
- `requireTenantScope` cross-tenant denemeyi 403 ile reddeder;
  SUPERADMIN bypass'lı.
- `patient.ownerId !== portalUser.ownerId` → 404 (sabit kod, hasta
  varlığı enumeration'a kapalı).
- Personel bildirimi için tenant'taki STAFF/VETERINARIAN listesine
  broadcast; bildirim `send` hatası talebi **durdurmaz** (best-effort).
- Bildirim template'leri: `portal.appointment.requested` (sahibine),
  `clinic.appointment.requested` (personele).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-appointment-request.ts`
- Liste: `GET /api/v1/portal-appointments/requests`
- İptal: `POST /api/v1/portal-appointments/requests/{id}/cancel`
- Personel onay: `POST /api/v1/clinic/portal-appointments/requests/{id}/approve`
- AI chunk: `flow-portal-appointment-request`
