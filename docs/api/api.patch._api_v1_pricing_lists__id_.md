# PATCH /api/v1/pricing/lists/{id}

Fiyat listesi kısmi güncelleme. Arşivli → 409
`VET-PRICING-0003`. Aktif listede değişiklik için yeni liste
zinciri (clone + update) önerilir.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:update`
- **Audit:** `audit:price_list.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PriceListUpdateInput`):**

```json
PATCH /api/v1/pricing/lists/pl-uuid
{
  "name": "2026 Standart Liste (Revize)",
  "effectiveTo": "2026-12-31T23:59:59.000Z"
}
```

- `name`, `type`, `currency`, `effectiveFrom`, `effectiveTo`,
  `notes` opsiyonel; en az bir alan.

**Response 200 (`PriceList`):**

`PriceList` şeması için bkz. `POST /api/v1/pricing/lists`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (404) — Liste bulunamadı.
- `VET-PRICING-0003` (409) — Arşivlenmiş liste
  güncellenemez.
- `VET-PRICING-0001` (409) — Geçersiz tarih aralığı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Detay: `GET /api/v1/pricing/lists/{id}`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list.update`
