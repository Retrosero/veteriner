# POST /api/v1/portal-appointments/requests/{id}/cancel

Talep sahibi kendi **bekleyen** talebini iptal eder. Yalnızca
`pending` statüsündeki talepler iptal edilebilir; zaten iptal
edilmiş talep için idempotent (no-op), onaylanmış/reddedilmiş
talep için 422.

- **Modül:** portal-appointments
- **Yetki:** `PortalSessionGuard`. Yalnızca talep sahibi
  (`ownerId === portalUser.ownerId`) iptal edebilir; personel bu
  endpoint'i kullanamaz.
- **Audit:** `audit:portal.appointment.cancel` (severity: info) —
  patientId, ownerId, previousStatus.
- **Idempotency:** Evet — zaten `cancelled` olan talep için no-op.
- **Yan etki:** Yok.

## Request

**Path params:**

- `id` (string, zorunlu) — `pareq-<tenant8>-<stamp>-<rnd>`.

**Headers:**

- `Cookie: vetniva_portal_session=<token>` **veya**
  `Authorization: Bearer <sessionToken>` — zorunlu.

Body: Yok.

## Response

**200 OK:**

```json
{
  "cancelled": true
}
```

## Hata kodları

- `VET-AUTH-0001` (401) — Portal session yok / süresi dolmuş.
- `VET-AUTHZ-0001` (403) — Cross-tenant session.
- `VET-CLINIC-0001` (404) — Talep bulunamadı, cross-tenant veya
  başka owner'ın talebi (bilgi sızdırmaz).
- `VET-PORTAL-0006` (422) — Talep `approved` veya `rejected`
  statüde; iptal edilemez.

## Güvenlik notları

- `existing.ownerId !== portalUser.ownerId` → 404 (bilgi
  sızdırmaz; talep var mı yok mu ayırt edilemez).
- Personel (`STAFF` / `VETERINARIAN`) bu endpoint'i kullanamaz
  (controller path `PortalSessionGuard` ile korunur). Personel
  iptal için doğrudan `DELETE` veya domain fonksiyonu
  eklenebilir (FAZ-3+).
- Audit event `decision: "cancel"` ile `previousStatus` payload'ı
  yazılır (info).

**Durum makinesi:**

```
pending    → cancelled ✅ (audit.info)
cancelled  → cancelled ✅ (idempotent, no-op)
approved   → cancelled ❌ (422 VET-PORTAL-0006)
rejected   → cancelled ❌ (422 VET-PORTAL-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-appointment-request.ts`
- Liste: `GET /api/v1/portal-appointments/requests`
- Oluşturma: `POST /api/v1/portal-appointments/requests`
- AI chunk: `flow-portal-appointment-request`
