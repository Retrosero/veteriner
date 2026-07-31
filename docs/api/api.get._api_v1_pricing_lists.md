# GET /api/v1/pricing/lists

Tenant-scoped fiyat listesi arama. `type`/`active`/
`effectiveAt`/`currency` filtreleri. Default sıralama
`effectiveFrom DESC`.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PriceListFilters`):**

- `type` (enum: `standard|promotional|contract`) opsiyonel.
- `active` (boolean) opsiyonel.
- `effectiveAt` (ISO datetime) opsiyonel — bu tarihte geçerli
  olan listeler.
- `currency` (ISO 4217) opsiyonel.
- `search` (string, 1-200) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PriceListListResponse`):**

```json
GET /api/v1/pricing/lists?type=standard&active=true
{
  "items": [
    {
      "id": "pl-uuid",
      "name": "2026 Standart Liste",
      "type": "standard",
      "currency": "TRY",
      "active": true,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "itemCount": 42
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Oluştur: `POST /api/v1/pricing/lists`
- AI chunk: `flow-pricing`
