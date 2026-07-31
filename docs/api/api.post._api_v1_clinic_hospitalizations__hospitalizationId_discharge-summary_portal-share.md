# POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/portal-share

Taburcu özetini hasta sahibi portalı ile paylaşır.
`shareToken` (UUID) + `shareUrl` döner. Sınırlı süreli
(30 gün) erişim.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:discharge`
- **Audit:** `audit:discharge_summary.portal_share` (info)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body (`PortalShareInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/discharge-summary/portal-share
{
  "expiresInDays": 30,
  "notifyOwner": true
}
```

- `expiresInDays` (integer, 1-90, default 30) opsiyonel.
- `notifyOwner` (boolean, default `true`) opsiyonel —
  owner'a SMS/email ile bildirim gönder.

**Response 201 (`PortalShare`):**

```json
{
  "id": "ps-uuid",
  "dischargeSummaryId": "ds-uuid",
  "shareToken": "uuid-token-xxx",
  "shareUrl": "https://portal.vetniva.com/share/uuid-token-xxx",
  "expiresAt": "2026-08-30T10:00:00.000Z",
  "createdAt": "2026-07-31T10:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Özet bulunamadı.
- (409) — Özet `finalized` veya `amended` olmalı.

**Token davranışı:** Sınırlı süreli (default 30 gün);
süre sonunda otomatik süresi dolmuş. `shareToken` UUID v4;
URL'de opaque.

**Audit detayı:** `shareToken` (hash) + `expiresAt` +
`notifyOwner` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- Portal: `flow-portal` (FAZ-2)
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:discharge_summary.portal_share`
