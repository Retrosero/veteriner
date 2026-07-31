# POST /api/v1/pricing/lists/{id}/archive

Fiyat listesini arşivler (soft delete). Aktif ise deaktive
edilir. Geçmiş satış/fatura referansı korunur (FK kırılmaz).

- **Modül:** pricing
- **Yetki:** `pricing:price_list:archive` (yüksek yetki)
- **Audit:** `audit:price_list.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PriceListArchiveInput`):**

```json
POST /api/v1/pricing/lists/pl-uuid/archive
{
  "reason": "Yeni liste devreye alındı"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`PriceList`):**

`PriceList`; `archivedAt`, `archivedBy`, `archiveReason`
set edilir; `active=false`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (404) — Liste bulunamadı.
- `VET-PRICING-0002` (409) — Zaten arşivlenmiş.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + `wasActive` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Detay: `GET /api/v1/pricing/lists/{id}`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list.archive`
