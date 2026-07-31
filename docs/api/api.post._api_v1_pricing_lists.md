# POST /api/v1/pricing/lists

Yeni fiyat listesi oluşturur. `type`: `standard` (default) |
`promotional` | `contract` (kurumsal anlaşma). Aktif liste
oluşturmak için önce `POST /:id/activate` gerekir.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:create`
- **Audit:** `audit:price_list.create` (info)

**Request body (`PriceListCreateInput`):**

```json
POST /api/v1/pricing/lists
{
  "name": "2026 Standart Liste",
  "type": "standard",
  "currency": "TRY",
  "effectiveFrom": "2026-01-01T00:00:00.000Z",
  "effectiveTo": "2026-12-31T23:59:59.000Z",
  "notes": "Yıllık standart fiyatlar"
}
```

- `name` (string, 1-200) zorunlu.
- `type` (enum) opsiyonel, default `standard`.
- `currency` (ISO 4217) zorunlu.
- `effectiveFrom` (ISO datetime) zorunlu.
- `effectiveTo` (ISO datetime) opsiyonel.
- `notes` (string) opsiyonel.

**Response 201 (`PriceList`):**

```json
{
  "id": "pl-uuid",
  "tenantId": "tnt-uuid",
  "name": "2026 Standart Liste",
  "type": "standard",
  "currency": "TRY",
  "effectiveFrom": "2026-01-01T00:00:00.000Z",
  "effectiveTo": "2026-12-31T23:59:59.000Z",
  "active": false,
  "itemCount": 0,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (409) — Geçersiz `effectiveFrom`/
  `effectiveTo` aralığı.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Liste: `GET /api/v1/pricing/lists`
- Detay: `GET /api/v1/pricing/lists/{id}`
- Güncelle: `PATCH /api/v1/pricing/lists/{id}`
- Aktifleştir: `POST /api/v1/pricing/lists/{id}/activate`
- Arşivle: `POST /api/v1/pricing/lists/{id}/archive`
- Items: `POST /api/v1/pricing/lists/{id}/items`
- Items liste: `GET /api/v1/pricing/lists/{id}/items`
- Item güncelle: `PATCH /api/v1/pricing/lists/{id}/items/{itemId}`
- Item iptal: `POST /api/v1/pricing/lists/{id}/items/{itemId}/cancel`
- Ürün fiyat çözümle: `GET /api/v1/pricing/products/{productId}/price`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list.create`
