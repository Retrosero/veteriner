# POST /api/v1/clinic/usages

Klinik tüketim kaydı oluşturur. Muayene, aşı uygulaması,
ameliyat veya yatış sırasında harcanan stok için atomik
`StockMovement` (`type='clinical_use'` veya
`type='vaccination'`, `direction='out'`) üretilir.

- **Modül:** clinical-usages
- **Yetki:** `clinic:stock:decrement`
- **Audit:** `audit:clinical_usage.create` (info)

**Request body (`ClinicalUsageCreateInput`):**

```json
POST /api/v1/clinic/usages
{
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "quantity": "2.00",
  "sourceType": "examination",
  "sourceId": "exam-uuid",
  "notes": "Ameliyat sırasında kullanıldı"
}
```

- `productId` (string) zorunlu.
- `lotId` (string) opsiyonel; lot-scoped tüketim için.
- `quantity` (Decimal, >0) zorunlu.
- `sourceType` (enum: `examination|vaccine_application|
surgery|hospitalization`) zorunlu.
- `sourceId` (string) zorunlu — ilgili muayene/aşı/ameliyat/
  yatış kaydı id.
- `notes` (string) opsiyonel.

**Response 201 (`ClinicalUsage`):**

```json
{
  "id": "cu-uuid",
  "tenantId": "tnt-uuid",
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "quantity": "2.00",
  "sourceType": "examination",
  "sourceId": "exam-uuid",
  "stockMovementId": "sm-uuid",
  "notes": "...",
  "createdAt": "2026-07-30T15:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-STOCK-0004` (404) — Ürün bulunamadı.
- `VET-STOCK-0005` (404) — Lot bulunamadı.
- `VET-STOCK-0007` (422) — Yetersiz stok.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**Stok entegrasyonu (GOAL-063):**

- Atomik `StockMovement` üretilir: `type='clinical_use'`
  (default) veya `type='vaccination'` (sourceType
  vaccine_application ise).
- `lotId` set edilmişse SKT/raf takibi korunur.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-usage.ts`
- Liste: `GET /api/v1/clinic/usages`
- Detay: `GET /api/v1/clinic/usages/{id}`
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-clinical-usage`
- Audit event: `audit:clinical_usage.create`
