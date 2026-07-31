# PATCH /api/v1/catalog/suppliers/{id}

Tedarikçi kısmi güncelleme. Arşivli → 409 `VET-SUPPLIER-0004`.
`code` değişirse unique kontrolü (`VET-SUPPLIER-0002`).

- **Modül:** suppliers
- **Yetki:** `catalog:supplier:update`
- **Audit:** `audit:supplier.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`SupplierUpdateInput`):**

```json
PATCH /api/v1/catalog/suppliers/sup-uuid
{
  "phone": "+90 212 555 1111",
  "notes": "Yeni iletişim"
}
```

- Tüm alanlar opsiyonel; en az bir alan set edilmeli.
- `code`, `name`, `type`, `taxId`, `taxOffice`, `contactInfo`,
  `notes`, `active`.

**Response 200 (`Supplier`):**

`Supplier` şeması için bkz. `POST /api/v1/catalog/suppliers`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SUPPLIER-0001` (404) — Tedarikçi bulunamadı.
- `VET-SUPPLIER-0002` (409) — Yeni `code` zaten kayıtlı.
- `VET-SUPPLIER-0004` (409) — Arşivlenmiş kayıt güncellenemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot; `code` değişiminde
before/after.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/supplier.ts`
- Detay: `GET /api/v1/catalog/suppliers/{id}`
- AI chunk: `flow-supplier`
- Audit event: `audit:supplier.update`
